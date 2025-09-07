const userList = document.getElementById("userList");

// Modal elements
const modal = document.getElementById("profileModal");
const closeModal = document.getElementById("closeModal");
const modalAvatar = document.getElementById("modalAvatar");
const modalUsername = document.getElementById("modalUsername");
const modalFollowers = document.getElementById("modalFollowers");
const modalFollowing = document.getElementById("modalFollowing");
const modalRepos = document.getElementById("modalRepos");
const modalProfileLink = document.getElementById("modalProfileLink");
const modalBio = document.getElementById("modalBio");

// Load users from JSON
let users = [];
fetch('gitusers.json')
  .then(res => res.json())
  .then(data => {
    users = data;
    renderUsers();
  });

// Render user cards
function renderUsers() {
  userList.innerHTML = '';
  users.forEach(user => {
    const card = document.createElement("div");
    card.classList.add("user-card");

    const img = document.createElement("img");
    img.src = `https://github.com/${user}.png`;

    const username = document.createElement("span");
    username.textContent = user;

    card.appendChild(img);
    card.appendChild(username);

    // Click card to open modal
    card.onclick = () => openModal(user);

    userList.appendChild(card);
  });
}

// Open modal with GitHub info
function openModal(username) {
  fetch(`https://api.github.com/users/${username}`)
    .then(res => res.json())
    .then(data => {
      modalAvatar.src = data.avatar_url;
      modalUsername.textContent = data.login;
      modalFollowers.textContent = data.followers;
      modalFollowing.textContent = data.following;
      modalRepos.textContent = data.public_repos;
      modalProfileLink.href = data.html_url;
      modalBio.textContent = data.bio || "No description available.";
      modal.style.display = "flex";
    })
    .catch(err => alert("Error fetching GitHub data!"));
}

// Close modal
closeModal.onclick = () => { modal.style.display = "none"; };
window.onclick = (e) => { if(e.target == modal) modal.style.display = "none"; };
