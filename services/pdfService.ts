
import { getDocument, GlobalWorkerOptions, OPS, version } from 'pdfjs-dist';
import { ExtractedImage } from '../types';

// Configure the worker using a reliable CDN that matches the major version
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version || '5.4.449'}/build/pdf.worker.min.mjs`;

export const extractImagesFromPdf = async (
  file: File,
  onProgress?: (current: number, total: number) => void
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

    // Map to deduplicate images. Key is DataURL (string content).
    const uniqueImages = new Map<string, ExtractedImage>();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (onProgress) {
          onProgress(pageNum, numPages);
      }

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Construct Extended Context: Prev + Current + Next
      const prevText = pageTexts[pageNum - 1] || '';
      const currText = pageTexts[pageNum] || '';
      const nextText = pageTexts[pageNum + 1] || '';
      
      const fullContext = `
      [SLIDE ${pageNum-1} TEXT]: ${prevText}
      [SLIDE ${pageNum} TEXT]: ${currText}
      [SLIDE ${pageNum+1} TEXT]: ${nextText}
      `;

      const ops = await page.getOperatorList();
      
      // Iterate through operations
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        
        // Case A: Named Image (XObject)
        if (fn === OPS.paintImageXObject) {
          const imgName = ops.argsArray[i][0];
          try {
              await new Promise<void>((resolve) => {
                  page.objs.get(imgName, (img: any) => {
                      if (img) processImage(img, pageNum, fullContext, viewport, uniqueImages);
                      resolve();
                  });
              });
          } catch (e) {
              console.warn(`Failed to extract image ${imgName} on page ${pageNum}`, e);
          }
        }
        // Case B: Inline Image
        else if (fn === OPS.paintInlineImageXObject) {
            const img = ops.argsArray[i][0];
            if (img) processImage(img, pageNum, fullContext, viewport, uniqueImages);
        }
      }
    }

    return Array.from(uniqueImages.values());
  } catch (error: any) {
    console.error("PDF Extraction Error:", error);
    throw new Error(error.message || "Failed to parse PDF file");
  }
};

const processImage = (
    img: any, 
    pageNum: number, 
    contextText: string,
    viewport: { width: number, height: number },
    uniqueImagesMap: Map<string, ExtractedImage>
) => {
    if (!img) return;

    const { width, height, data } = img;
    if (!data || !data.length) return; 

    // FILTER 1: Basic Size (Keep it very permissive)
    if (width < 20 || height < 20) return; 
    
    // Very small area check
    if (width * height < 200) return;

    // FILTER 2: Extreme Aspect Ratio (Remove thin lines)
    const aspect = width / height;
    if (aspect > 50 || aspect < 0.02) return;
    
    // Convert to Data URL
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const imageData = ctx.createImageData(width, height);
    
    // Handle different channel formats
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
        return;
    }

    // REMOVED PIXEL VALIDATION FILTER
    // We trust the Review Screen to let the user filter out solid blocks.
    
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');

    // DEDUPLICATION: Check if this exact image exists
    if (uniqueImagesMap.has(dataUrl)) {
        const existing = uniqueImagesMap.get(dataUrl)!;
        // Merge Context if significantly different/new
        if (!existing.contextText.includes(`[SLIDE ${pageNum} TEXT]`)) {
             existing.contextText += `\n\n[SLIDE ${pageNum} TEXT]: ...\n${contextText.substring(0, 500)}...`;
        }
    } else {
        uniqueImagesMap.set(dataUrl, {
            id: `${pageNum}-${width}x${height}-${Math.random().toString(36).substr(2, 9)}`,
            dataUrl,
            pageIndex: pageNum,
            contextText
        });
    }
};
