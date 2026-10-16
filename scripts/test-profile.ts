import { prisma } from '../src/shared/database/prisma.js';
import { decryptToken } from '../src/shared/utils/crypto.js';

async function main() {
  const account = await prisma.instagramAccount.findFirst({ where: { isActive: true } });
  if (!account) return;
  const token = decryptToken({
    encrypted: account.accessTokenEncrypted,
    iv: account.accessTokenIv,
    authTag: account.accessTokenTag,
  });

  console.log('Testing /me with profile_picture_url...');
  const res = await fetch(`https://graph.instagram.com/v26.0/me?fields=id,username,name,profile_picture_url&access_token=${token}`);
  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
}

main().finally(() => process.exit(0));
