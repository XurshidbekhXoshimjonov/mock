(function () {
    const path = String(window.location.pathname || "").toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const requestedType = String(params.get("type") || "").toLowerCase();
    const returnPath = params.get("return");
    try {
        const currentPath = window.location.pathname + window.location.search;
        if (returnPath) {
            sessionStorage.setItem("premiumReturnPath", returnPath);
        } else if (!path.includes("premium-locked")) {
            sessionStorage.setItem("premiumReturnPath", currentPath);
        }
    } catch {
        // Session storage may be unavailable in some privacy modes; access checks still work server-side.
    }
    const title = document.getElementById("premiumLockedTitle");
    const message = document.getElementById("premiumLockedMessage");
    const benefitOne = document.getElementById("premiumBenefitOne");
    const benefitTwo = document.getElementById("premiumBenefitTwo");
    const benefitThree = document.getElementById("premiumBenefitThree");
    const benefitIconOne = document.getElementById("premiumBenefitIconOne");
    const benefitIconTwo = document.getElementById("premiumBenefitIconTwo");
    const benefitIconThree = document.getElementById("premiumBenefitIconThree");
    const content = path.includes("speaking") || requestedType === "speaking"
        ? {
            title: "Speaking practice requires Premium",
            message: "Speaking practice and AI Speaking evaluation are available for Premium users. Upgrade to continue and unlock the full speaking experience.",
            benefits: ["AI evaluation", "Unlimited speaking practice", "Detailed feedback"],
            benefitIcons: [
                "/premium-icons/writing-ai-evaluation.png?v=20260713-icons-all-v1",
                "/premium-icons/writing-unlimited-practice.png?v=20260713-icons-all-v1",
                "/premium-icons/writing-detailed-feedback.png?v=20260713-icons-all-v1"
            ]
        }
        : path.includes("writing") || requestedType === "writing"
            ? {
            title: "Writing practice requires Premium",
            message: "Writing practice and AI Writing evaluation are available for Premium users. Upgrade to continue and unlock the full writing experience.",
            benefits: ["AI evaluation", "Unlimited writing practice", "Detailed feedback"],
            benefitIcons: [
                    "/premium-icons/writing-ai-evaluation.png?v=20260713-icons-all-v1",
                    "/premium-icons/writing-unlimited-practice.png?v=20260713-icons-all-v1",
                    "/premium-icons/writing-detailed-feedback.png?v=20260713-icons-all-v1"
                ]
            }
            : {
            title: "Full IELTS Mock Tests require Premium",
            message: "Complete IELTS Mock Tests are available for Premium users. Upgrade to start full simulations and receive detailed feedback.",
            benefits: ["Full simulation", "All IELTS sections", "Detailed feedback"],
            benefitIcons: [
                "/premium-icons/mock-full-simulation.png?v=20260713-mock-icons-v1",
                "/premium-icons/mock-all-sections.png?v=20260713-mock-icons-v1",
                "/premium-icons/writing-detailed-feedback.png?v=20260713-mock-icons-v1"
            ]
            };

    title.textContent = content.title;
    message.textContent = content.message;
    if (benefitOne) benefitOne.textContent = content.benefits[0];
    if (benefitTwo) benefitTwo.textContent = content.benefits[1];
    if (benefitThree) benefitThree.textContent = content.benefits[2];

    [benefitIconOne, benefitIconTwo, benefitIconThree].forEach((icon, index) => {
        const src = content.benefitIcons[index];
        if (!icon || !src) return;
        icon.src = src;
        icon.classList.toggle("premium-locked-benefit-img--native", src.includes("mock-all-sections"));
        icon.hidden = false;
    });
}());
