// Görsel yükleme ve önizleme fonksiyonu
const fileInput = document.getElementById('fileInput');
const imagePreview = document.getElementById('imagePreview');
const previewDescription = document.getElementById('previewDescription');

fileInput.addEventListener('change', function () {
    const file = fileInput.files[0]; // Seçilen dosyayı al
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            imagePreview.src = e.target.result; // Yüklenen görselin önizlemesini ayarlama
            imagePreview.classList.remove('hidden'); // Önizleme görselini görünür yapma
            previewDescription.textContent = file.name; // Yüklenen dosyanın ismini gösterme
        };
        reader.readAsDataURL(file); // Görseli veri URL'si olarak oku
    } else {
        imagePreview.classList.add('hidden'); // Dosya seçilmezse önizlemeyi gizle
        previewDescription.textContent = 'Yüklenen görsel buraya gelecek.'; // Varsayılan açıklamayı geri yükle
    }
});