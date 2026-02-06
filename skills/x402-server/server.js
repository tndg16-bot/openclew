const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = 4002;

app.use(bodyParser.json());

// Public Endpoint
app.get('/', (req, res) => {
    res.json({
        name: "Clawdbot Agent API",
        version: "1.0.0",
        description: "Autonomous services available via x402."
    });
});

// Paid Endpoint (x402 Protected)
app.post('/api/work', (req, res) => {
    const paymentToken = req.headers['x-payment-token'];

    // Check for payment
    if (!paymentToken) {
        // Return 402 if not paid
        return res.status(402).json({
            error: "Payment Required",
            message: "Please send 0.001 ETH (Base) to proceed.",
            address: "0x1f8EbB7f94dE2B50F9fFE81f65C9B68EED7fd0CD",
            invoiceId: "inv_" + Date.now()
        });
    }

    // Mock verification of payment token
    if (paymentToken === "mock-valid-token") {
        console.log("Payment verified! Executing job...");
        const { job } = req.body;

        return res.json({
            status: "success",
            result: `Job '${job}' completed by Agent.`,
            timestamp: new Date().toISOString()
        });
    } else {
        return res.status(403).json({ error: "Invalid payment token" });
    }
});

function main() {
    app.listen(PORT, () => {
        console.log(`x402 Server running on http://localhost:${PORT}`);
        console.log(`- Public: GET /`);
        console.log(`- Paid:   POST /api/work`);
    });
}

main();
