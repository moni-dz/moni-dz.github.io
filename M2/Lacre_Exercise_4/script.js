const apiKey = "1a1df7de3a2340d38db72020250302";
const city = "Davao";

function callAPI() {
    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${city}&aqi=no`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            console.log(data);
            document.querySelector('#weather_city').textContent = data.location.name || "N/A";
            document.querySelector('#weather_temperature').textContent = `${data.current.temp_c}C` || "N/A";
            document.querySelector('#weather_condition').textContent = data.current.condition.text || "N/A";
        });
}