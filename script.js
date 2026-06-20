/* =========================
   LISTENING TEST SCRIPT
========================= */




/* TEXT INPUTS */

const inputs =
document.querySelectorAll(".listening-answer");




/* SAVE TEXT ANSWERS */

inputs.forEach((input, index) => {

    const savedAnswer =
    localStorage.getItem(`answer-${index}`);

    if(savedAnswer){

        input.value = savedAnswer;

    }

    input.addEventListener("input", () => {

        localStorage.setItem(
            `answer-${index}`,
            input.value
        );

    });

});




/* SAVE RADIO ANSWERS */

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




/* SUBMIT BUTTON */

const submitBtn =
document.getElementById("submitBtn");




/* SUBMIT EVENT */

if (submitBtn) {
submitBtn.addEventListener("click", () => {

    let score = 0;




    /* REMOVE OLD COLORS */

    inputs.forEach(input => {

        input.classList.remove("correct");

        input.classList.remove("wrong");

    });

    document
    .querySelectorAll(".option")
    .forEach(option => {

        option.classList.remove("correct");

        option.classList.remove("wrong");

    });




    /* QUESTION 1 */

    if(
        inputs[0].value.trim().toLowerCase()
        === "keiko"
    ){

        score++;

        inputs[0].classList.add("correct");

    }

    else{

        inputs[0].classList.add("wrong");

    }




    /* QUESTION 2 */

    if(
        inputs[1].value.trim().toLowerCase()
        === "jo6337"
    ){

        score++;

        inputs[1].classList.add("correct");

    }

    else{

        inputs[1].classList.add("wrong");

    }




    /* QUESTION 3 */

    if(
        inputs[2].value.trim().toLowerCase()
        === "advanced english studies"
    ){

        score++;

        inputs[2].classList.add("correct");

    }

    else{

        inputs[2].classList.add("wrong");

    }




    /* QUESTION 4 */

    if(
        inputs[3].value.trim().toLowerCase()
        === "5 months"
    ){

        score++;

        inputs[3].classList.add("correct");

    }

    else{

        inputs[3].classList.add("wrong");

    }




    /* QUESTION 5 */

    if(
        inputs[4].value.trim().toLowerCase()
        === "about 4 months"
    ){

        score++;

        inputs[4].classList.add("correct");

    }

    else{

        inputs[4].classList.add("wrong");

    }




    /* QUESTION 6 */

    const selected =
    document.querySelector(
        'input[name="q6"]:checked'
    );



    if(selected){

        if(selected.value === "B"){

            score++;

            selected.parentElement
            .classList.add("correct");

        }

        else{

            selected.parentElement
            .classList.add("wrong");

        }

    }




    /* QUESTION 7 */

    if(
        inputs[5].value.trim().toLowerCase()
        === "seafood"
    ){

        score++;

        inputs[5].classList.add("correct");

    }

    else{

        inputs[5].classList.add("wrong");

    }




    /* QUESTION 8 */

    if(
        inputs[6].value.trim().toLowerCase()
        === "tennis"
    ){

        score++;

        inputs[6].classList.add("correct");

    }

    else{

        inputs[6].classList.add("wrong");

    }




    /* QUESTION 9 */

    if(
        inputs[7].value.trim().toLowerCase()
        === "take the train"
    ){

        score++;

        inputs[7].classList.add("correct");

    }

    else{

        inputs[7].classList.add("wrong");

    }




    /* QUESTION 10 */

    if(
        inputs[8].value.trim().toLowerCase()
        === "this afternoon"
    ){

        score++;

        inputs[8].classList.add("correct");

    }

    else{

        inputs[8].classList.add("wrong");

    }




    /* RESULT MODAL */

    const resultModal =
    document.getElementById("resultModal");

    const scoreText =
    document.getElementById("scoreText");



    scoreText.innerHTML =
    `Your score is ${score}/10`;

    window.authClient?.recordTestResult({
        type: "Listening",
        title: "IELTS Listening Part 1",
        correct: score,
        total: 10
    });



    resultModal.style.display =
    "flex";




    /* CLEAR STORAGE */

    localStorage.clear();

});
}




/* CLOSE MODAL */

/* CLOSE MODAL */

const closeModal =
document.getElementById("closeModal");

if (closeModal) {
closeModal.addEventListener("click", () => {

    window.location.href =
    "/listeningpart1.html";

});
}




/* TIMER */

let time = 8 * 60;

const timer =
document.querySelector(".timer");



function updateTimer(){

    let minutes =
    Math.floor(time / 60);

    let seconds =
    time % 60;



    if(seconds < 10){

        seconds = "0" + seconds;

    }



    timer.innerHTML =
    `Time ${minutes}:${seconds}`;



    if(time > 0){

        time--;

    }

}



if (timer) {
setInterval(updateTimer, 1000);

updateTimer();
}
