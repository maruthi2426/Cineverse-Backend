import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input"; // npm install input
import dotenv from "dotenv";
dotenv.config();
const apiId = Number(process.env.apiId);
const apiHash = process.env.apiHash;
const stringSession = new StringSession(""); // Empty for first time
if (!apiId || !apiHash) {
    throw new Error("Missing API_ID or API_HASH in environment variables");
}
(async () => {
    console.log("🔐 Starting session generator...");
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
    await client.start({
        phoneNumber: async () => await input.text("📞 Enter your phone number: "),
        password: async () => await input.text("🔑 Enter your 2FA password (if any): "),
        phoneCode: async () => await input.text("💬 Enter the code you got on Telegram: "),
        onError: (err) => console.log("❌ Error:", err),
    });
    console.log("✅ Logged in successfully!");
    console.log("👉 Your String Session:\n");
    console.log(client.session.save()); // Copy this string and put it in .env
    process.exit(0);
})();
//# sourceMappingURL=generateSession.js.map