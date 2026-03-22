document.getElementById('settings-form').addEventListener('submit', function(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    alert('Ayarlar başarıyla güncellendi!');
    this.reset();
});