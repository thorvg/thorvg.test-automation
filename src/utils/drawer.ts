import { testingSize } from "./constant";

export const drawSvgIntoCanvas = async (targetSvg: Element, canvas: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    const svg = targetSvg.cloneNode(true) as Element;
    svg.setAttribute('width', `${testingSize}px`);
    svg.setAttribute('height', `${testingSize}px`);

    const svgString = svg.outerHTML;

    const URL = window.URL || window.webkitURL || window;
    const blob = new Blob([svgString], {type:'image/svg+xml;charset=utf-8'});

    const blobURL = URL.createObjectURL(blob);
    const img = new Image();

    img.src = blobURL;
    
    // set it as the source of the img element
    img.onload = () => {
        // draw the image onto the canvas
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve();
    }

    img.onerror = (err: any) => {
        console.error('error on loading image' + err);
        reject();
    }
  });
};
