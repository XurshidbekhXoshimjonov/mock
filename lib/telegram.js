async function sendTelegramMessage(text) {
    const token = process.env.BOT_TOKEN;
    const adminId = process.env.ADMIN_ID;

    if (!token || !adminId || !text) {
        return false;
    }

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    chat_id: adminId,
                    text: String(text).slice(0, 4000),
                    parse_mode: "HTML"
                })
            }
        );

        return response.ok;
    } catch (error) {
        console.warn("Telegram notify failed:", error.message);
        return false;
    }
}

module.exports = {
    sendTelegramMessage
};
