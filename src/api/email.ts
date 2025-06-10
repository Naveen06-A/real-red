export const sendAgentCredentialsEmail = async (
  email: string,
  password: string,
  name: string,
  qrCodeDataUrl?: string
) => {
  const response = await fetch('/api/send-agent-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      name,
      subject: 'Your Agent Account Details',
      message: `
        Hello ${name},
        Your agent account has been created successfully!
        Email: ${email}
        Temporary Password: ${password}
        Please log in at [Your App URL] and change your password.
      `,
      attachments: qrCodeDataUrl
        ? [{ content: qrCodeDataUrl.split('data:image/png;base64,')[1], filename: 'agent-credentials-qr.png', type: 'image/png' }]
        : [],
    }),
  });
  if (!response.ok) throw new Error('Failed to send email');
};