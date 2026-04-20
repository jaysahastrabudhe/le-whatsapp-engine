import { redisClient } from './src/lib/queue/client';

async function main() {
  const outbound = await redisClient.llen('le:queue:outbound');
  const delayed = await redisClient.llen('le:queue:outbound:delayed');
  const campaign = await redisClient.llen('le:queue:campaign');
  
  console.log(`\nActive Outbound: ${outbound}`);
  console.log(`Delayed Outbound: ${delayed}`);
  console.log(`Campaign Outbound: ${campaign}`);
}
main().catch(console.error);
