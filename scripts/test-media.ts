import { prisma } from '../src/shared/database/prisma.js';
import { decryptToken } from '../src/shared/utils/crypto.js';

async function main() {
  const account = await prisma.instagramAccount.findFirst({ where: { isActive: true } });
  if (!account) {
    console.log('No active account found');
    return;
  }
  const token = decryptToken({
    encrypted: account.accessTokenEncrypted,
    iv: account.accessTokenIv,
    authTag: account.accessTokenTag,
  });
  console.log('Account username:', account.username, 'ID:', account.igUserId);

  // 1. Try graph.instagram.com/v26.0/me/media
  console.log('--- Calling graph.instagram.com/v26.0/me/media ---');
  try {
    const res = await fetch(`https://graph.instagram.com/v26.0/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=10&access_token=${token}`);
    const data = await res.json();
    console.log('IG Graph Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('IG Error:', e);
  }

  // 2. Try graph.facebook.com/v26.0/{igUserId}/media
  console.log('--- Calling graph.facebook.com/v26.0/' + account.igUserId + '/media ---');
  try {
    const res = await fetch(`https://graph.facebook.com/v26.0/${account.igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=10&access_token=${token}`);
    const data = await res.json();
    console.log('FB Graph Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('FB Error:', e);
  }
}

main().finally(() => process.exit(0));
