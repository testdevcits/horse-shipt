exports.vehicleVerificationMailTemplate = (vehicleNumber, status, message) => {
  const isVerified = status === "VERIFIED";

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body{
                font-family: Arial, sans-serif;
                background:#f4f6f9;
                padding:20px;
            }
            .card{
                max-width:600px;
                margin:auto;
                background:white;
                padding:30px;
                border-radius:10px;
                box-shadow:0 0 10px rgba(0,0,0,0.1);
                text-align:center;
            }
            .success{
                color:green;
                font-size:22px;
                font-weight:bold;
            }
            .reject{
                color:red;
                font-size:22px;
                font-weight:bold;
            }
            .vehicle-box{
                background:#fafafa;
                padding:15px;
                border-radius:8px;
                margin:20px 0;
            }
        </style>
    </head>

    <body>

    <div class="card">

        <h2>
            ${isVerified ? "Vehicle Verified" : "Vehicle Verification Failed"}
        </h2>

        <p class="${isVerified ? "success" : "reject"}">
            Vehicle Number: ${vehicleNumber}
        </p>

        <div class="vehicle-box">
            <p>Status : <strong>${status}</strong></p>
            <p>Message : ${message || "Verification update"}</p>
        </div>

        <p style="color:#666">
            If you have any questions, please contact support.
        </p>

    </div>

    </body>
    </html>
    `;
};
