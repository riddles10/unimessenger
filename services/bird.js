const BIRD_BASE = 'https://api.bird.com';

export async function sendViaBird({ channelId, phone, text }) {
  const res = await fetch(
    `${BIRD_BASE}/workspaces/${process.env.BIRD_WORKSPACE_ID.trim()}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `AccessKey ${process.env.BIRD_ACCESS_KEY.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receiver: {
          contacts: [{ identifierKey: 'phonenumber', identifierValue: phone }]
        },
        body: {
          type: 'text',
          text: { text }
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Bird API error: ${JSON.stringify(err)}`);
  }

  return res.json();
}
