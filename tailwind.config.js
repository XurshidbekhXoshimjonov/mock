/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./reading-template.html",
        "./full-test-player.html",
        "./reading-cbt-app.js",
        "./ielts-test-components.js",
        "./profile.html",
        "./profile-settings.html",
        "./profile-dashboard.js"
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', "sans-serif"]
            },
            boxShadow: {
                card: "0 18px 45px rgba(7, 21, 71, 0.09)"
            }
        }
    },
    plugins: []
};
