import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

async function main() {
  console.log('API key prefix:', process.env.ANTHROPIC_API_KEY?.slice(0, 15));
  const client = new Anthropic();

  const models = [
    'claude-sonnet-4-5-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-latest',
    'claude-3-haiku-20240307',
    'claude-3-5-haiku-latest',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
  ];

  for (const model of models) {
    try {
      const msg = await client.messages.create({
        model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      });
      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      console.log(`${model} -> OK: "${text}"`);
    } catch (e: any) {
      console.log(`${model} -> ${e.status}: ${e.error?.error?.message ?? e.message}`);
    }
  }
}

main();
