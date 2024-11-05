// src/main.ts

// Create a container div
const container = document.createElement("div");
container.id = "buttonContainer";

// Create a button element
const button = document.createElement("button");
button.textContent = "Click me";

// Add an event listener to the button
button.addEventListener("click", () => {
  alert("You clicked the button!");
});

// Append the button to the container
container.appendChild(button);

// Append the container to the body of the document
document.body.appendChild(container);
