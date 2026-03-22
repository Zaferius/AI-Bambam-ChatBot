function previewImage(event) {
    const preview = document.getElementById('image-preview');
    const errorMessage = document.getElementById('error-message');
    const file = event.target.files[0];
    const reader = new FileReader();

    errorMessage.textContent = ''; // Önceki hata mesajını kaldır

    reader.onload = function(e) {
        preview.src = e.target.result;
        preview.style.display = 'block';
    }

    if (file && file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
    } else {
        errorMessage.textContent = 'Lütfen geçerli bir görsel dosyası yükleyin.';
        preview.src = '';
        preview.style.display = 'none';
    }
}