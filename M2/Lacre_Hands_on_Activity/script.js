const endpoint = "https://api.opendota.com/api";
const playerId = document.getElementById('playerId');
let heroes = [];

fetch(`${endpoint}/heroes`)
    .then(r => r.json())
    .then(h => { heroes = h; });

document.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();

    fetch(`${endpoint}/players/${playerId.value}`)
        .then(response => response.json())
        .then(data => {
            const playerIcon = document.getElementById('playerIcon');
            const playerName = document.getElementById('playerName');
            playerIcon.src = data.profile.avatarfull;
            playerName.textContent = data.profile.personaname;
        })
        .catch(error => console.error(`Error fetching data: ${error}`));

    fetch(`${endpoint}/players/${playerId.value}/wl`)
        .then(response => response.json())
        .then(data => {
            const playerW = document.getElementById('playerW');
            const playerL = document.getElementById('playerL');
            playerW.textContent = data.win + "W";
            playerL.textContent = data.lose + "L";
        })
        .catch(error => console.error(`Error fetching data: ${error}`));

    fetch(`${endpoint}/players/${playerId.value}/heroes`)
        .then(response => response.json())
        .then(data => {
            const playerTopHeroes = document.getElementById('playerTopHeroes');
            const topFiveHeroes = []

            data.slice(0, 5).forEach(hero => {
                topFiveHeroes.push({ hero_id: hero.hero_id, wins: hero.win, games: hero.games });
            });

            topFiveHeroes.forEach(heroData => {
                const playerTopHeroes = document.getElementById('playerTopHeroes');
                const hero = document.createElement('li');

                const heroName = heroes.filter(hero => hero.id === heroData.hero_id)[0].localized_name;
                hero.textContent = `${heroName} - ${heroData.wins}/${heroData.games}`;
                playerTopHeroes.appendChild(hero);
            })
        })
        .catch(error => console.error(`Error fetching data: ${error}`));

    fetch(`${endpoint}/players/${playerId.value}/recentMatches`)
        .then(response => response.json())
        .then(data => {
            const playerRecentMatches = document.getElementById('playerRecentMatches');

            const table = document.createElement('table');
            table.style.textAlign = 'center';
            table.innerHTML = `
            <tr>
                <th>Match ID</th>
                <th>Hero</th>
                <th>Duration</th>
                <th>Winner</th>
                <th>K/D/A</th>
                <th>GPM</th>
                <th>XPM</th>
            </tr>
        `;

            table.style.backgroundColor = '#fff';
            table.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            table.style.overflow = 'hidden';
            table.style.margin = '20px 0';
            table.style.borderCollapse = 'collapse';
            table.style.border = '1px solid black';
            table.style.padding = '8px';
            const style = document.createElement('style');
            style.textContent = 'td, th { border: 1px solid black; padding: 8px; }';
            document.head.appendChild(style);
            table.style.width = '100%';
            table.innerHTML = `
            <tr>
                <th>Match ID</th>
                <th>Hero</th>
                <th>Duration</th>
                <th>Winner</th>
                <th>K/D/A</th>
                <th>GPM</th>
                <th>XPM</th>
            </tr>
        `;

            data.forEach(match => {
                const row = document.createElement('tr');
                const heroName = heroes.filter(hero => hero.id === match.hero_id)[0].localized_name;
                row.innerHTML = `
                <td>${match.match_id}</td>
                <td>${heroName}</td>
                <td>${Math.floor(match.duration / 3600) > 0 ? Math.floor(match.duration / 3600) + ':' : ''}${String(Math.floor((match.duration % 3600) / 60)).padStart(2, '0')}:${String(match.duration % 60).padStart(2, '0')}</td>
                <td>${match.radiant_win ? "Radiant" : "Dire"}</td>
                <td>${match.kills}/${match.deaths}/${match.assists}</td>
                <td>${match.gold_per_min}</td>
                <td>${match.xp_per_min}</td>
            `;
                table.appendChild(row);
            });

            playerRecentMatches.appendChild(table);
        })
        .catch(error => console.error(`Error fetching data: ${error}`));

        document.getElementById('playerData').style.display = "flex";
});