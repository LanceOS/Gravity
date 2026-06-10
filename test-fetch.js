fetch("http://localhost:5173/api/v1/notes/note-f24d8186-ed99-4efd-9b39-41a98a26a143/media/0eee9bfaf9217cacbc7aa387b6f07bb9.jpg")
  .then(res => res.text().then(text => console.log(res.status, text)))
  .catch(console.error);
