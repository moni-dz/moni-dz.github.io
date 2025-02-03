const button = document.getElementById('changeTextBtn');
const header = document.getElementById('header');

button.addEventListener('click', () => {
    header.textContent = 'Text Changed!';
});