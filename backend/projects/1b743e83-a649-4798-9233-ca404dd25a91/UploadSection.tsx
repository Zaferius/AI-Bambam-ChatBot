import React from 'react';

const UploadSection: React.FC = () => {
  const handleFileUpload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const formData = new FormData();
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    
    if (fileInput.files && fileInput.files.length > 0) {
      formData.append('file', fileInput.files[0]);

      fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        console.log('Dosya Yüklendi:', data);
        alert(data.message);
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Dosya yüklenirken bir hata oluştu.');
      });
    } else {
      alert('Lütfen bir dosya seçin.');
    }
  };

  return (
    <div className="text-center p-10">
      <h2 className="text-4xl font-bold mb-4">Dosya Yükle</h2>
      <form id="upload-form" onSubmit={handleFileUpload} className="flex flex-col items-center">
        <input type="file" id="file-input" className="mb-4 p-2 border border-gray-300 rounded" required />
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700">
          Dosyayı Yükle
        </button>
      </form>
      <div id="upload-message" className="mt-4"></div>
    </div>
  );
};

export default UploadSection;