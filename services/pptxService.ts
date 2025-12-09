
import JSZip from 'jszip';
import { ExtractedImage } from '../types';

export const extractImagesFromPptx = async (
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedImage[]> => {
    try {
        const zip = await JSZip.loadAsync(file);
        
        // Map to store unique images by their internal path in the zip
        // Key: zipPath, Value: ExtractedImage
        const uniqueImages = new Map<string, ExtractedImage>();

        // Identify slide files in the zip structure
        const slideFiles = Object.keys(zip.files).filter(path => 
            path.match(/^ppt\/slides\/slide\d+\.xml$/)
        ).sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml/)![1]);
            const numB = parseInt(b.match(/slide(\d+)\.xml/)![1]);
            return numA - numB;
        });

        const totalSlides = slideFiles.length;
        const slideTexts: string[] = new Array(totalSlides + 1).fill('');

        const parser = new DOMParser();

        // 1. Pre-extract text from all slides
        for (let i = 0; i < totalSlides; i++) {
            const slidePath = slideFiles[i];
            const slideXmlStr = await zip.file(slidePath)?.async('string');
            if (slideXmlStr) {
                const slideDoc = parser.parseFromString(slideXmlStr, "application/xml");
                // Extract text from standard text bodies and tables
                const textNodes = slideDoc.querySelectorAll('t, txBody'); 
                let t = "";
                // Simple iteration over potential text content
                for (let j=0; j<textNodes.length; j++) {
                    t += (textNodes[j].textContent || "") + " ";
                }
                slideTexts[i+1] = t.trim();
            }
        }

        // 2. Extract Images with Extended Context
        for (let i = 0; i < totalSlides; i++) {
            const slidePath = slideFiles[i];
            const pageNum = i + 1;
            
            if (onProgress) onProgress(pageNum, totalSlides);

            // Construct Context
            const prevText = slideTexts[pageNum - 1] || '';
            const currText = slideTexts[pageNum] || '';
            const nextText = slideTexts[pageNum + 1] || '';
            
            const fullContext = `
            [SLIDE ${pageNum-1}]: ${prevText}
            [SLIDE ${pageNum}]: ${currText}
            [SLIDE ${pageNum+1}]: ${nextText}
            `;

            // Extract Images using Relationships (RELS)
            const fileName = slidePath.split('/').pop();
            const relsPath = `ppt/slides/_rels/${fileName}.rels`;
            const relsXmlStr = await zip.file(relsPath)?.async('string');
            
            if (relsXmlStr) {
                const slideXmlStr = await zip.file(slidePath)!.async('string');
                const slideDoc = parser.parseFromString(slideXmlStr, "application/xml");
                const relsDoc = parser.parseFromString(relsXmlStr, "application/xml");
                const relationships = relsDoc.getElementsByTagName('Relationship');
                
                const relMap = new Map<string, string>();
                for(let k=0; k<relationships.length; k++) {
                    const id = relationships[k].getAttribute('Id');
                    const type = relationships[k].getAttribute('Type');
                    const target = relationships[k].getAttribute('Target');
                    
                    if (id && target && type && type.toLowerCase().includes('image')) {
                        relMap.set(id, target);
                    }
                }

                // Helper to process an embed ID found in the slide
                const processEmbedId = async (embedId: string | null) => {
                    if (!embedId || !relMap.has(embedId)) return;

                    let targetPath = relMap.get(embedId)!;
                    
                    // Normalize path
                    if (targetPath.startsWith('../')) {
                        targetPath = 'ppt/' + targetPath.substring(3);
                    } else if (!targetPath.startsWith('ppt/')) {
                            targetPath = 'ppt/slides/' + targetPath; 
                    }
                    targetPath = targetPath.replace('//', '/');

                    // If we've already extracted this image, just append context and return
                    if (uniqueImages.has(targetPath)) {
                        const existing = uniqueImages.get(targetPath)!;
                        // Append context if it's new
                        if (!existing.contextText.includes(`[SLIDE ${pageNum}]`)) {
                             existing.contextText += `\n\n--- Also on Slide ${pageNum} ---\n${currText}`;
                        }
                        return;
                    }

                    // Locate file in zip
                    let imgFile = zip.file(targetPath);
                    if (!imgFile) {
                        // Fallback: search by filename in media folder
                        const simpleName = targetPath.split('/').pop();
                        const foundPath = Object.keys(zip.files).find(p => p.endsWith('media/' + simpleName));
                        if (foundPath) imgFile = zip.file(foundPath);
                    }

                    if (imgFile) {
                        const imgBlob = await imgFile.async('blob');
                        const reader = new FileReader();
                        const dataUrl = await new Promise<string>((resolve) => {
                            reader.onload = () => resolve(reader.result as string);
                            reader.readAsDataURL(imgBlob);
                        });

                        // Basic Dimension Check only - No strict pixel analysis
                        const imgObj = new Image();
                        await new Promise<void>((resolve) => {
                            imgObj.onload = () => {
                                // Keep very small icons out, but allow almost everything else
                                if (imgObj.width > 15 && imgObj.height > 15) {
                                    uniqueImages.set(targetPath, {
                                        id: `pptx-${pageNum}-${embedId}-${Date.now()}`,
                                        dataUrl,
                                        pageIndex: pageNum,
                                        contextText: fullContext
                                    });
                                }
                                resolve();
                            };
                            imgObj.onerror = () => resolve();
                            imgObj.src = dataUrl;
                        });
                    }
                };

                // 1. Standard Images (a:blip)
                const blips = slideDoc.getElementsByTagName('a:blip');
                for(let b=0; b<blips.length; b++) {
                    await processEmbedId(blips[b].getAttribute('r:embed'));
                }

                // 2. Legacy VML Images (v:imagedata) - Often used for copy-pasted images
                const vImages = slideDoc.getElementsByTagName('v:imagedata');
                for(let v=0; v<vImages.length; v++) {
                    await processEmbedId(vImages[v].getAttribute('r:id') || vImages[v].getAttribute('o:relid'));
                }

                // 3. Alternate Content (pic:blipFill) - Catch all elements with r:embed just in case
                // This is a "catch-all" scan for any tag having r:embed if it wasn't caught above
                const allEls = slideDoc.getElementsByTagName('*');
                for(let elIdx=0; elIdx<allEls.length; elIdx++) {
                    const el = allEls[elIdx];
                    const embed = el.getAttribute('r:embed');
                    if(embed && relMap.has(embed)) {
                        // If standard blip scan missed it or it's a weird tag
                        const target = relMap.get(embed)!;
                        let resolvedPath = target.startsWith('../') ? 'ppt/' + target.substring(3) : 'ppt/slides/' + target;
                        resolvedPath = resolvedPath.replace('//', '/');
                        if(!uniqueImages.has(resolvedPath)) {
                             await processEmbedId(embed);
                        }
                    }
                }
            }
        }
        return Array.from(uniqueImages.values());
    } catch (error: any) {
        console.error("PPTX Extraction Error:", error);
        throw new Error(error.message || "Failed to parse PPTX file");
    }
};
