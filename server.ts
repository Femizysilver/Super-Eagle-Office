import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import cron from "node-cron";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const SCRIPT_URL = process.env.VITE_GOOGLE_SCRIPT_URL || "https://script.google.com/macros/s/AKfycby3kzMLkOCiO8sAMJgyws-BEpeqhdiudNx0kSJ7ai1RaxmR2iEaL6fi1i1f2yTcMvYf/exec";

// SMTP Configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || "femizysilver@gmail.com",
    pass: process.env.SMTP_PASS || "zcng lkau mcty kvtm",
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

// Helper for fetch with timeout
async function fetchWithTimeout(url: string, options: any = {}) {
  const { timeout = 15000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Helper to fetch data from Google Sheets
async function fetchAllData() {
  try {
    const response = await fetchWithTimeout(`${SCRIPT_URL}?action=allData`);
    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error);
    return [];
  }
}

// Helper to fetch user list
async function fetchUserList() {
  try {
    const response = await fetchWithTimeout(`${SCRIPT_URL}?action=listUsers`);
    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error("Error fetching user list:", error);
    return [];
  }
}

// Function to generate and send summaries
async function sendSummaries(type: "weekly" | "monthly") {
  console.log(`Generating ${type} summaries...`);
  const users = await fetchUserList();
  const allData = await fetchAllData();
  
  if (users.length === 0) {
    console.log("No users found to send summaries.");
    return;
  }

  const now = new Date();
  const startDate = new Date();
  if (type === "weekly") {
    startDate.setDate(now.getDate() - 7);
  } else {
    startDate.setMonth(now.getMonth() - 1);
  }

  const adminEmail = "femizysilver@gmail.com"; // Default admin
  let teamSummaryHtml = `<h2>Team Performance Summary (${type})</h2><table border="1" style="border-collapse: collapse; width: 100%;">
    <thead>
      <tr style="background-color: #f2f2f2;">
        <th style="padding: 8px;">User</th>
        <th style="padding: 8px;">Completed Projects</th>
        <th style="padding: 8px;">Total Earnings</th>
      </tr>
    </thead>
    <tbody>`;

  for (const userEmail of users) {
    const userData = allData.filter((row: any) => 
      row.Email === userEmail && 
      new Date(row["Date/Time"]) >= startDate &&
      row.Type !== "User Profile"
    );

    const completedProjects = userData.filter((row: any) => row.Status === "Completed").length;
    const totalEarnings = userData.reduce((sum: number, row: any) => sum + (parseFloat(row.Amount) || 0), 0);
    const currency = userData[0]?.Currency || "$";

    teamSummaryHtml += `<tr>
      <td style="padding: 8px;">${userEmail}</td>
      <td style="padding: 8px; text-align: center;">${completedProjects}</td>
      <td style="padding: 8px; text-align: right;">${currency}${totalEarnings.toFixed(2)}</td>
    </tr>`;

    // Individual Summary
    let userSummaryHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h1 style="color: #2563eb;">${type.charAt(0).toUpperCase() + type.slice(1)} Performance Summary</h1>
        <p>Hello,</p>
        <p>Here is your performance summary for the past ${type === "weekly" ? "week" : "month"}:</p>
        
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
            <span style="font-weight: bold; color: #64748b;">Completed Projects:</span>
            <span style="font-weight: bold; color: #0f172a;">${completedProjects}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: bold; color: #64748b;">Total Earnings:</span>
            <span style="font-weight: bold; color: #2563eb;">${currency}${totalEarnings.toFixed(2)}</span>
          </div>
        </div>

        <h3 style="color: #0f172a;">Recent Activity:</h3>
        <ul style="list-style: none; padding: 0;">
          ${userData.length > 0 ? userData.slice(0, 5).map((row: any) => `
            <li style="padding: 10px; border-bottom: 1px solid #f1f5f9;">
              <div style="font-weight: bold;">${row["Details/Service"]}</div>
              <div style="font-size: 12px; color: #94a3b8;">${row.Status} • ${new Date(row["Date/Time"]).toLocaleDateString()}</div>
            </li>
          `).join("") : "<li>No activity recorded for this period.</li>"}
        </ul>
        
        <p style="margin-top: 30px; font-size: 12px; color: #94a3b8; text-align: center;">
          This is an automated message from Super Eagles Office Platform.
        </p>
      </div>
    `;

    // Send to user
    try {
      await transporter.sendMail({
        from: `"Super Eagles Office" <${process.env.SMTP_USER || "femizysilver@gmail.com"}>`,
        to: userEmail,
        subject: `Your ${type.charAt(0).toUpperCase() + type.slice(1)} Performance Summary`,
        html: userSummaryHtml,
      });
      console.log(`Summary sent to ${userEmail}`);
    } catch (error) {
      console.error(`Failed to send email to ${userEmail}:`, error);
    }
  }

  teamSummaryHtml += `</tbody></table>`;

  // Send Admin Summary
  try {
    await transporter.sendMail({
      from: `"Super Eagles Office" <${process.env.SMTP_USER || "femizysilver@gmail.com"}>`,
      to: adminEmail,
      subject: `Team ${type.charAt(0).toUpperCase() + type.slice(1)} Performance Summary`,
      html: `
        <div style="font-family: sans-serif; max-width: 800px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h1 style="color: #2563eb;">Admin Dashboard: ${type.charAt(0).toUpperCase() + type.slice(1)} Summary</h1>
          <p>Hello Admin,</p>
          <p>Here is the team's performance summary for the past ${type === "weekly" ? "week" : "month"}:</p>
          ${teamSummaryHtml}
          <p style="margin-top: 30px; font-size: 12px; color: #94a3b8; text-align: center;">
            This is an automated message from Super Eagles Office Platform.
          </p>
        </div>
      `,
    });
    console.log(`Admin summary sent to ${adminEmail}`);
  } catch (error) {
    console.error(`Failed to send admin email:`, error);
  }
}

// Schedule Weekly Summary: Saturday 5:00 PM
// 0 17 * * 6 (Minute 0, Hour 17, Day of Month *, Month *, Day of Week 6)
cron.schedule("0 17 * * 6", () => {
  sendSummaries("weekly");
});

// Schedule Monthly Summary: 1st of every month at 8:00 AM
cron.schedule("0 8 1 * *", () => {
  sendSummaries("monthly");
});

// In-memory store for OTPs (for production, use Redis or similar)
const tempOTPs = new Map<string, { otp: string; expires: number }>();

// Helper to fetch vault password from Google Sheets
async function getVaultPassword(email: string) {
  try {
    console.log(`Fetching vault password for ${email}...`);
    const response = await fetchWithTimeout(`${SCRIPT_URL}?action=allData&email=${email}`);
    const result = await response.json();
    const allData = result.data || [];
    
    console.log(`Fetched ${allData.length} rows for vault check`);
    
    // Find the vault row specifically for this email
    const vaultRow = allData.find((row: any) => {
      const rowEmail = (row.Email || row.email || row['Email Address'] || '').toString().toLowerCase().trim();
      const targetEmail = email.toLowerCase().trim();
      
      const isVaultRow = (
        row.Type === "Vault Password" || 
        row.type === "Vault Password" ||
        row.AccountName === "VAULT_MASTER_PASSWORD" || 
        row.accountName === "VAULT_MASTER_PASSWORD" ||
        row['Details/Service'] === "VAULT_MASTER_PASSWORD" ||
        row.Service === "VAULT_MASTER_PASSWORD" ||
        row.service === "VAULT_MASTER_PASSWORD"
      );
      
      return rowEmail === targetEmail && isVaultRow;
    });
    
    if (vaultRow) {
      const pass = (
        vaultRow.Password || 
        vaultRow.password || 
        vaultRow.Amount || 
        vaultRow.amount || 
        vaultRow.Status || 
        vaultRow.status || 
        vaultRow.Details || 
        vaultRow.details ||
        vaultRow['Details/Service']
      );
      return pass;
    }
    return null;
  } catch (error) {
    console.error("Error fetching vault password:", error);
    return null;
  }
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Vault API: Check if user has a vault password
app.get("/api/vault/check", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email required" });
  
  const password = await getVaultPassword(email as string);
  res.json({ hasPassword: !!password });
});

// Vault API: Setup vault password
app.post("/api/vault/setup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  
  // Save to Google Sheets via GAS
  try {
    console.log(`Setting up vault password for ${email}...`);
    const response = await fetchWithTimeout(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveVault",
        email,
        accountName: "VAULT_MASTER_PASSWORD",
        password,
        type: "Vault Password"
      }),
    });
    
    console.log(`GAS response status: ${response.status}`);
    
    // Check if the request actually went through
    if (response.ok) {
      res.json({ success: true });
    } else {
      const errorText = await response.text();
      console.error(`GAS error response: ${errorText}`);
      res.status(500).json({ error: "Failed to save vault password to Google Sheets" });
    }
  } catch (error) {
    console.error("Vault setup error:", error);
    res.status(500).json({ error: "Failed to connect to Google Sheets" });
  }
});

// Vault API: Login and send OTP
app.post("/api/vault/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  
  console.log(`Vault login attempt for ${email}...`);
  const storedPassword = await getVaultPassword(email);
  
  if (!storedPassword) {
    console.error(`No vault password found for ${email}`);
    return res.status(401).json({ error: "No vault password found. Please set one first." });
  }

  const cleanStored = storedPassword.toString().trim();
  const cleanInput = password.toString().trim();

  if (cleanStored !== cleanInput) {
    console.error(`Invalid vault password for ${email}.`);
    console.log(`DEBUG: Stored: "${cleanStored}" vs Input: "${cleanInput}"`);
    return res.status(401).json({ error: "Invalid vault password" });
  }
  
  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  tempOTPs.set(email, { otp, expires: Date.now() + 10 * 60 * 1000 }); // 10 mins expiry
  
  console.log(`Generated OTP for ${email}: ${otp}`);
  
  // Send OTP via Email
  try {
    await transporter.sendMail({
      from: `"Super Eagles Office" <${process.env.SMTP_USER || "femizysilver@gmail.com"}>`,
      to: email,
      subject: "Your Secure Vault OTP",
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px; text-align: center;">
          <h2 style="color: #2563eb;">Secure Vault Access</h2>
          <p>Your one-time password (OTP) to unlock your secure vault is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a; margin: 20px 0;">${otp}</div>
          <p style="color: #64748b; font-size: 14px;">This code will expire in 10 minutes.</p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });
    res.json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Failed to send OTP:", error);
    res.status(500).json({ error: "Failed to send OTP email" });
  }
});

// Vault API: Verify OTP
app.post("/api/vault/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });
  
  const stored = tempOTPs.get(email);
  if (!stored) return res.status(400).json({ error: "No OTP requested for this email" });
  
  if (Date.now() > stored.expires) {
    tempOTPs.delete(email);
    return res.status(400).json({ error: "OTP has expired" });
  }
  
  if (stored.otp !== otp) {
    return res.status(400).json({ error: "Invalid OTP" });
  }
  
  tempOTPs.delete(email);
  res.json({ success: true });
});

// Vault API: Resend OTP
app.post("/api/vault/resend-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  
  // Reuse login logic but without password check (assuming they already passed it)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  tempOTPs.set(email, { otp, expires: Date.now() + 10 * 60 * 1000 });
  
  try {
    await transporter.sendMail({
      from: `"Super Eagles Office" <${process.env.SMTP_USER || "femizysilver@gmail.com"}>`,
      to: email,
      subject: "Your New Secure Vault OTP",
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px; text-align: center;">
          <h2 style="color: #2563eb;">New Secure Vault Access Code</h2>
          <p>Your new one-time password (OTP) is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a; margin: 20px 0;">${otp}</div>
          <p style="color: #64748b; font-size: 14px;">This code will expire in 10 minutes.</p>
        </div>
      `,
    });
    res.json({ success: true, message: "New OTP sent" });
  } catch (error) {
    res.status(500).json({ error: "Failed to resend OTP" });
  }
});

// Manual trigger for testing
app.post("/api/trigger-summary", async (req, res) => {
  const { type, secret } = req.body;
  if (secret !== "admin-secret-123") return res.status(403).json({ error: "Unauthorized" });
  
  await sendSummaries(type === "monthly" ? "monthly" : "weekly");
  res.json({ message: `${type} summaries triggered successfully.` });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
