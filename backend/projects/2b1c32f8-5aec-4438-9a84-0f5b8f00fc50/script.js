const fileInput = document.getElementById('fileInput');
const imagePreview = document.getElementById('imagePreview');

fileInput.addEventListener('change', function() {
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.classList.remove('hidden'); // Önizleme görselini göster
        };
        reader.readAsDataURL(file);
    } else {
        imagePreview.classList.add('hidden'); // Görsel yüklenmezse gizle
    }
});