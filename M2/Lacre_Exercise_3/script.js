fetch('https://randomuser.me/api/')
.then(response => response.json())
.then(data => {
    const userData = data.results[0];
    const userDataDiv = document.getElementById('userData');

    userDataDiv.innerHTML = `
        <p>Name: ${userData.name.first} ${userData.name.last}</p>
        <p>Email: ${userData.email}</p>
        <img src="${userData.picture.medium}" alt="User Image">
    `;
})
.catch(error => console.error(`Error fetching data: ${error}`));