import React, { useState } from 'react';

const App: React.FC = () => {
    const [image, setImage] = useState<File | null>(null);
    const [format, setFormat] = useState<'png' | 'jpeg'>('png');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            setImage(event.target.files[0]);
        }
    };

    const handleFormatChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setFormat(event.target.value as 'png' | 'jpeg');
    };

    const convertImage = async () => {
        if (!image) return;

        const reader = new FileReader();
        reader.readAsArrayBuffer(image);
        reader.onloadend = async () => {
            const buffer = reader.result;
            if (buffer) {
                const blob = new Blob([new Uint8Array(buffer)], { type: image.type });
                const convertedUrl = URL.createObjectURL(blob);
                setDownloadUrl(convertedUrl);
            }
        };
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <h1 className="text-2xl font-bold mb-4">JPEG to PNG & PNG to JPEG Converter</h1>
            <input
                type="file"
                accept=".png, .jpeg, .jpg"
                onChange={handleImageChange}
                className="mb-4"
            />
            <select onChange={handleFormatChange} className="mb-4">
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
            </select>
            <button
                onClick={convertImage}
                className="px-4 py-2 text-white bg-blue-500 rounded"
            >
                Convert
            </button>
            {downloadUrl && (
                <a href={downloadUrl} download={`converted-image.${format}`}>
                    <button className="mt-4 px-4 py-2 text-white bg-green-500 rounded">
                        Download Converted Image
                    </button>
                </a>
            )}
        </div>
    );
};

export default App;