document.getElementById('upload-form').addEventListener('submit', function(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('file-input');
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    fetch('/api/upload', {
        method: 'POST',
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        const messageElement = document.getElementById('upload-message');
        messageElement.textContent = data.message;
        messageElement.classList.add('success-message'); // Mavi renk
    })
    .catch(error => {
        console.error('Error:', error);
        const messageElement = document.getElementById('upload-message');
        messageElement.textContent = 'Yükleme sırasında bir hata oluştu.';
        messageElement.classList.add('error-message'); // Kırmızı hata rengi
    });
});