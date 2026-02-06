import React, { useState, useRef } from 'react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';

interface ImageCropperProps {
  imageSrc: string;
  originalFileName: string;
  onCropComplete: (file: File) => void;
  onCancel: () => void;
  t: (key: string) => string;
}

// Helper function to get the cropped image data as a File object
function getCroppedImg(image: HTMLImageElement, crop: PixelCrop, fileName: string): Promise<File> {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = Math.floor(crop.width * scaleX);
    canvas.height = Math.floor(crop.height * scaleY);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return Promise.reject(new Error('Canvas context is not available.'));
    }

    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;
    const cropWidth = crop.width * scaleX;
    const cropHeight = crop.height * scaleY;

    ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error('Canvas is empty'));
                    return;
                }
                const newFile = new File([blob], fileName, { type: 'image/jpeg' });
                resolve(newFile);
            },
            'image/jpeg',
            0.95, // quality
        );
    });
}

const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, originalFileName, onCropComplete, onCancel, t }) => {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const imgRef = useRef<HTMLImageElement>(null);

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget;
        const initialCrop = centerCrop(
            makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
            width,
            height,
        );
        setCrop(initialCrop);
    }

    const handleSaveCrop = async () => {
        if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0 && imgRef.current) {
            try {
                const croppedFile = await getCroppedImg(imgRef.current, completedCrop, `cropped_${originalFileName}`);
                onCropComplete(croppedFile);
            } catch (e) {
                console.error('Cropping failed', e);
                // Optionally, show an error to the user
                onCancel();
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60] backdrop-blur-md">
            <div className="bg-card border border-border rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <header className="p-4 border-b border-border flex-shrink-0">
                    <h3 className="text-lg font-bold text-text-strong">{t('cropper_title')}</h3>
                </header>
                <div className="p-4 flex-grow flex justify-center items-center overflow-hidden">
                     <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        aspect={1}
                        className="max-w-full max-h-full"
                    >
                        <img ref={imgRef} src={imageSrc} onLoad={onImageLoad} alt="Crop preview" style={{ maxHeight: '65vh', objectFit: 'contain' }} />
                    </ReactCrop>
                </div>
                <footer className="flex justify-end gap-2 p-4 border-t border-border flex-shrink-0">
                    <button onClick={onCancel} className="btn-secondary">{t('cropper_cancel')}</button>
                    <button onClick={handleSaveCrop} className="btn-primary">{t('cropper_save')}</button>
                </footer>
            </div>
        </div>
    );
};

export default ImageCropper;
