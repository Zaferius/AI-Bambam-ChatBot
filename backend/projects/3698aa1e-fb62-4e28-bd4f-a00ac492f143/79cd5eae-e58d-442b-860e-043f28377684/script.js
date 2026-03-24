document.addEventListener("DOMContentLoaded", function() {
    const taskForm = document.getElementById("task-form");
    const taskInput = document.getElementById("task-input");
    const taskList = document.getElementById("task-list");

    taskForm.addEventListener("submit", function(e) {
        e.preventDefault();
        const taskText = taskInput.value.trim();
        if (taskText) {
            const taskItem = document.createElement("li");

            const taskContent = document.createElement("span");
            taskContent.textContent = taskText;
            taskItem.appendChild(taskContent);

            const deleteButton = document.createElement("button");
            deleteButton.textContent = "Sil";
            deleteButton.className = "delete-button";
            taskItem.appendChild(deleteButton);

            taskList.appendChild(taskItem);
            taskInput.value = "";
            taskInput.focus();

            deleteButton.addEventListener("click", function() {
                taskList.removeChild(taskItem);
            });
        }
    });
});