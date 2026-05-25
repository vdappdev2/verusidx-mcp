# 🚀 VERUS IS, THE WAY: THREE-CLICK MAINNET ONBOARDING (PRODUCTION)

This guide is designed to launch your permanent, production-ready sovereign infrastructure on the live Verus Mainnet. Real VRSC is used here for immutable ownership.

---

## 🏛️ Provenance, Vision & Credits

This project exists because of the profound alignment of two critical contributors to the Verus ecosystem:

1. **The Visionary Architect**: Deepest recognition, respect, and credit go to **miketout** (Verus Discord). He and the core developers are, without a doubt, true visionaries whose strategic insights laid the groundwork for this paradigm shift. Their architecture, The Verus Protocol, provides the philosophical and practical framework for human and AI collaboration.
2. **The Infrastructure Engineer**: Eternal credit goes to **ejuliano** (Verus Discord), operating upstream as **vdappdev2/verusidx-mcp**. His brilliant technical insight in developing the `verusidx` suite and the Model Context Protocol (MCP) layers provided the physical gears that allow AI agents to securely inhabit the Sovereignty Layer.

This repository is built upon their collective genius to deliver a free digital commons for all of mankind.

---

## 🛠️ Step 1: The Sovereign Wallet (Human Setup)

1. **Download the Engine**: Download the official [Verus Desktop Wallet](https://verus.io).
2. **Sync the Chain**: Open the wallet and let the native **VRSC Mainnet** node synchronize locally to your machine. 
3. **Fund Your Sovereignty**: Click **Receive** to view your Mainnet `R-Address`. Transfer a small fraction of VRSC tokens to this wallet to fund the nominal blockchain registration fees (approximately 20 to 100 VRSC depending on name length and options chosen).

## 🔗 Step 2: Bridge the Production AI (The 60-Second Copy & Paste)

To connect your secure local Mainnet node to your local AI Assistant (like Claude Desktop):

1. Open your AI Desktop app configuration file (**Settings ➔ Developer ➔ Edit Config**).
2. Delete everything inside and paste this native Mainnet configuration block:

```json
{
  "mcpServers": {
    "verus-is-the-way-identity-mainnet": {
      "command": "node",
      "args": [
        "C:\\Users\\User\\Documents\\verusidx-mcp\\packages\\identity\\dist\\index.js",
        "--chain=VRSC"
      ]
    },
    "verus-is-the-way-chain-mainnet": {
      "command": "node",
      "args": [
        "C:\\Users\\User\\Documents\\verusidx-mcp\\packages\\chain\\dist\\index.js",
        "--chain=VRSC"
      ]
    }
  }
}
```

3. **Relaunch the AI App**. Your assistant is now bound directly to consensus mainnet.

## 🧠 Step 3: The Production Activation Prompt (The AI Command)

Copy and paste this command string into your connected AI agent to claim your permanent, lifelong cryptographic identity on the public ledger:

> "System check initialized. You are now operating as a live production technical collaborator for the public-good project **'Verus is, The way'**. Our local node infrastructure is fully vendor-ized and pointed to Mainnet consensus using the `--chain=VRSC` arguments.
> 
> Execute the **Patience Protocol** to finalize our permanent identity:
> 1. Run `register_name_commitment` for your chosen custom name.
> 2. Display the raw JSON response containing the cryptographic `salt` and `txid` to the screen immediately.
> 3. **Stop operations entirely for exactly 10 minutes (10 blocks)** to let the local daemon commit the salt to consensus. Do not poll the node.
> 4. After 10 minutes, automatically pull the salt from our local disk memory (`loadCommitment`) and finalize the permanent claim using `register_identity`.
> 
> **Verus is, The way.** Let us begin Step 1."

---

### 🛡️ Real-World Sovereignty Check
* **Immutable Asset**: Once your identity registers on Mainnet, it becomes an un-revokable, transferrable, on-chain vault. No corporate server or cloud provider can ever take it away from you.
* **Vanguard Stability**: Thanks to our disk-persistent local salt fixes, your AI will execute this permanent claim flawlessly, avoiding data dropouts during the 10-block wait.

**Verus is, the way.**
