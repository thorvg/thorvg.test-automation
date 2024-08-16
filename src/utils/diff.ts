import resemble from 'resemblejs';

export const diffCanvas = async (canvas: any, targetCanvas: any): Promise<number> => {
  const thorvgURL = canvas.toDataURL("image/png");
  const lottieURL = targetCanvas.toDataURL("image/png");

  return new Promise((resolve, reject) => {
    resemble.compare(thorvgURL, lottieURL, { scaleToSameSize: true }, (err: any, data: any) => {
      console.log(err);
      const { misMatchPercentage, getImageDataUrl } = data;
      const diffImg = document.querySelector('#diff-img') as any;
      diffImg.src = getImageDataUrl();
      
      const result = parseFloat((100 - misMatchPercentage).toFixed(2));
      resolve(result);
    });
  });
}
