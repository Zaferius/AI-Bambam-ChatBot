document.addEventListener("DOMContentLoaded", function() {
    const addTodoButton = document.getElementById('add-todo-btn');
    const newTodoInput = document.getElementById('new-todo-input');
    const todosList = document.getElementById('todos');

    // Yeni görev ekleme
    addTodoButton.addEventListener('click', function() {
        const taskText = newTodoInput.value.trim();
        if (taskText !== "") {
            const todoItem = document.createElement('li');
            todoItem.textContent = taskText;

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Sil';
            deleteButton.style.marginLeft = '20px';
            deleteButton.style.backgroundColor = '#ff5722';
            deleteButton.style.border = 'none';
            deleteButton.style.color = 'white';
            deleteButton.style.padding = '5px 10px';
            deleteButton.style.borderRadius = '5px';
            deleteButton.style.cursor = 'pointer';

            deleteButton.addEventListener('click', function() {
                todosList.removeChild(todoItem);
            });

            todoItem.appendChild(deleteButton);
            todosList.appendChild(todoItem);

            newTodoInput.value = '';
        }
    });
});