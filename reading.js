/* =========================
   READING TEST SCRIPT
========================= */




/* TIMER */

let time = 20 * 60;

const timer =
document.getElementById("timer");



setInterval(() => {

    let minutes =
    Math.floor(time / 60);

    let seconds =
    time % 60;



    if(seconds < 10){

        seconds = "0" + seconds;

    }



    timer.innerHTML =
    `⏱ ${minutes}:${seconds}`;



    if(time > 0){

        time--;

    }

}, 1000);




/* TEXT INPUTS */

const textInputs =
document.querySelectorAll(".reading-answer");




/* SAVE TEXT ANSWERS */

textInputs.forEach((input, index) => {

    const saved =
    localStorage.getItem(`reading-${index}`);

    if(saved){

        input.value = saved;

    }

    input.addEventListener("input", () => {

        localStorage.setItem(
            `reading-${index}`,
            input.value
        );

    });

});




/* RADIO BUTTONS */

const radios =
document.querySelectorAll('input[type="radio"]');



radios.forEach((radio) => {

    const saved =
    localStorage.getItem(radio.name);



    if(saved === radio.value){

        radio.checked = true;

    }



    radio.addEventListener("change", () => {

        localStorage.setItem(
            radio.name,
            radio.value
        );

    });

});




/* CORRECT ANSWERS */

const correctAnswers = {

    q1: "FALSE",
    q2: "TRUE",
    q3: "NOT GIVEN"

};




/* SUBMIT BUTTON */

const submitBtn =
document.querySelector(".submit-test-btn");




/* SUBMIT EVENT */

submitBtn.addEventListener("click", () => {

    let score = 0;




    /* REMOVE OLD COLORS */

    document
    .querySelectorAll(".answer-option")
    .forEach(option => {

        option.classList.remove("correct");

        option.classList.remove("wrong");

    });




    /* CHECK QUESTIONS */

    for(let i = 1; i <= 3; i++){

        const selected =
        document.querySelector(
            `input[name="q${i}"]:checked`
        );



        if(selected){

            if(
                selected.value ===
                correctAnswers[`q${i}`]
            ){

                score++;

                selected.parentElement
                .classList.add("correct");

            }

            else{

                selected.parentElement
                .classList.add("wrong");

            }

        }

    }




    /* RESULT MODAL */

    const resultModal =
    document.getElementById("resultModal");

    const scoreText =
    document.getElementById("scoreText");



    scoreText.innerHTML =
    `Your score is ${score}/3`;

    window.authClient?.recordTestResult({
        type: "Reading",
        title: "IELTS Reading Practice Test",
        correct: score,
        total: 3
    });



    resultModal.style.display =
    "flex";




    /* CLEAR STORAGE */

    localStorage.clear();

});




/* CLOSE MODAL */

const closeModal =
document.getElementById("closeModal");



closeModal.addEventListener("click", () => {

    window.location.href =
    "part1.html";

});
