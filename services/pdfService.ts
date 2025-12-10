
import { getDocument, GlobalWorkerOptions, OPS, version } from 'pdfjs-dist';
import { ExtractedImage } from '../types';
import PptxGenJS from 'pptxgenjs';

// Configure the worker using a reliable CDN that matches the major version
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version || '5.4.449'}/build/pdf.worker.min.mjs`;

/**
 * Extracts distinct images from a PDF file.
 * @param file The PDF file
 * @param onProgress Progress callback
 * @param deduplicate If true (default), prevents duplicate images across pages. Set false for PPTX generation.
 */
export const extractImagesFromPdf = async (
  file: File,
  onProgress?: (current: number, total: number) => void,
  deduplicate: boolean = true
): Promise<ExtractedImage[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    // 1. Pre-extract all text from pages to build context window
    const pageTexts: string[] = new Array(numPages + 1).fill(''); // 1-based index
    
    for (let p = 1; p <= numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const text = textContent.items
            .map((item: any) => item.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        pageTexts[p] = text;
    }

    const images: ExtractedImage[] = [];
    const seenDataUrls = new Set<string>();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (onProgress) {
          onProgress(pageNum, numPages);
      }

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      
      const prevText = pageTexts[pageNum - 1] || '';
      const currText = pageTexts[pageNum] || '';
      const nextText = pageTexts[pageNum + 1] || '';
      
      const fullContext = `
      [SLIDE ${pageNum-1} TEXT]: ${prevText}
      [SLIDE ${pageNum} TEXT]: ${currText}
      [SLIDE ${pageNum+1} TEXT]: ${nextText}
      `;

      const ops = await page.getOperatorList();
      
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        
        // Helper to process raw image object from PDF
        const processRawImage = (img: any) => {
             if (!img) return;
             const { width, height, data } = img;
             if (!data || !data.length) return; 
             
             // Filter very small noise (bullets, lines)
             if (width < 30 || height < 30) return;

             const canvas = document.createElement('canvas');
             canvas.width = width;
             canvas.height = height;
             const ctx = canvas.getContext('2d');
             if (!ctx) return;

             const imageData = ctx.createImageData(width, height);
             
             // Handle basic color spaces (RGB, RGBA, Grayscale)
             if (data.length === width * height * 4) { 
                 imageData.data.set(data);
             } 
             else if (data.length === width * height * 3) {
                 let j = 0;
                 for (let k = 0; k < data.length; k += 3) {
                     imageData.data[j++] = data[k];
                     imageData.data[j++] = data[k + 1];
                     imageData.data[j++] = data[k + 2];
                     imageData.data[j++] = 255;
                 }
             }
             else if (data.length === width * height) {
                 let j = 0;
                 for (let k = 0; k < data.length; k++) {
                     const val = data[k];
                     imageData.data[j++] = val;
                     imageData.data[j++] = val;
                     imageData.data[j++] = val;
                     imageData.data[j++] = 255;
                 }
             } else {
                 return; // Unsupported format, skip
             }

             ctx.putImageData(imageData, 0, 0);
             const dataUrl = canvas.toDataURL('image/png');

             // Logic: If deduplicate is ON, we skip if seen.
             // If deduplicate is OFF, we always add (for PPTX slides).
             if (deduplicate) {
                 if (seenDataUrls.has(dataUrl)) return;
                 seenDataUrls.add(dataUrl);
             }

             images.push({
                id: `${pageNum}-${width}x${height}-${Math.random().toString(36).substr(2, 9)}`,
                dataUrl,
                pageIndex: pageNum,
                contextText: fullContext
             });
        };

        // Case A: Named Image (XObject)
        if (fn === OPS.paintImageXObject) {
          const imgName = ops.argsArray[i][0];
          try {
              await new Promise<void>((resolve) => {
                  page.objs.get(imgName, (img: any) => {
                      processRawImage(img);
                      resolve();
                  });
              });
          } catch (e) {
              // Ignore extraction errors
          }
        }
        // Case B: Inline Image
        else if (fn === OPS.paintInlineImageXObject) {
            const img = ops.argsArray[i][0];
            processRawImage(img);
        }
      }
    }

    return images;
  } catch (error: any) {
    console.error("PDF Extraction Error:", error);
    throw new Error(error.message || "Failed to parse PDF file");
  }
};

/**
 * Fallback: Converts every page of a PDF into a high-quality PNG image.
 */
export const convertPdfPagesToImages = async (
    file: File,
    onProgress?: (current: number, total: number) => void
): Promise<{ pageNum: number; dataUrl: string }[]> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        const results: { pageNum: number; dataUrl: string }[] = [];

        for (let i = 1; i <= numPages; i++) {
            if (onProgress) onProgress(i, numPages);
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) continue;
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const dataUrl = canvas.toDataURL('image/png');
            results.push({ pageNum: i, dataUrl });
        }
        return results;
    } catch (error: any) {
        throw new Error("Failed to convert PDF pages to images.");
    }
};

/**
 * SMART PDF TO PPTX
 * 1. Text is extracted and put in a textbox.
 * 2. Images are extracted individually and placed in a grid.
 */
export const createPptxFromPdf = async (
    file: File,
    onProgress?: (current: number, total: number) => void
): Promise<Blob> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;

        // 1. Extract ALL images first (deduplicate = false to get them per page)
        // We do this first to have the data ready
        const allImages = await extractImagesFromPdf(file, undefined, false);

        const pres = new PptxGenJS();
        pres.layout = 'LAYOUT_16x9';

        for (let i = 1; i <= numPages; i++) {
            if (onProgress) onProgress(i, numPages);
            
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const text = textContent.items
                .map((item: any) => item.str)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            
            // Filter images belonging to this page
            const pageImages = allImages.filter(img => img.pageIndex === i);
            
            const slide = pres.addSlide();
            
            // A) Add Text Box (Left Side: 50%)
            slide.addText(text.substring(0, 1500) || "(No text detected)", {
                x: 0.2, y: 0.5, w: 4.8, h: 4.8,
                fontSize: 10, color: '363636', align: 'left', valign: 'top',
                isTextBox: true,
                shape: pres.ShapeType.rect,
                fill: { color: 'F7F7F7' },
                line: { color: 'E0E0E0', width: 1 }
            });

            // B) Add Images (Right Side: 50% Grid)
            // Layout: Grid starting at x=5.2
            const startX = 5.2;
            const startY = 0.5;
            const imgSize = 2.0; 
            
            if (pageImages.length > 0) {
                pageImages.forEach((img, idx) => {
                    if (idx < 6) { // Max 6 images per slide to fit
                        const col = idx % 2;
                        const row = Math.floor(idx / 2);
                        
                        slide.addImage({
                            data: img.dataUrl,
                            x: startX + (col * (imgSize + 0.2)),
                            y: startY + (row * (imgSize + 0.2)),
                            w: imgSize,
                            h: imgSize,
                            sizing: { type: 'contain', w: imgSize, h: imgSize }
                        });
                    }
                });
            } else {
                 slide.addText("(No images detected)", {
                    x: 5.2, y: 2.5, w: 4.0, h: 1.0,
                    fontSize: 12, color: 'AAAAAA', align: 'center'
                });
            }
            
            // Add Page Number
            slide.addText(`Slide ${i}`, { x: 9, y: 5.2, fontSize: 8, color: '888888', align:'right' });
        }

        return await pres.write("blob") as Blob;
    } catch (error: any) {
        console.error("PPTX Generation Error:", error);
        throw new Error("Failed to create PowerPoint from PDF.");
    }
};
