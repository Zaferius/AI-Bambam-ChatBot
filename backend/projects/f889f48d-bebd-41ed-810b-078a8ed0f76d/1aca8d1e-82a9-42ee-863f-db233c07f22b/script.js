document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('to-do-form');
    const input = document.getElementById('new-task');
    const taskList = document.getElementById('task-list');

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const taskText = input.value.trim();
        if (taskText !== '') {
            addTask(taskText);
            input.value = '';
            input.focus();
        }
    });

    function addTask(taskText) {
        const li = document.createElement('li');
        li.textContent = taskText;

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Sil';
        deleteButton.addEventListener('click', function () {
            taskList.removeChild(li);
        });

        li.appendChild(deleteButton);
        taskList.appendChild(li);
    }
});