/**
 * 注册声誉服务 Agent 并获取凭证
 * 用法: cd ai-backend-template && node ../OceanBusDocs/register-reputation-agent.js
 */
const request = require('superagent');

const BASE_URL = process.env.BASE_URL || 'https://ai-t.ihaola.com.cn/api/l0';

async function main() {
  console.log('注册声誉服务 L0 Agent...\n');

  // 1. 注册
  const reg = await request.post(`${BASE_URL}/agents/register`).timeout(10000).ok(() => true);
  if (reg.body.code !== 0) {
    console.log(`❌ 注册失败: ${reg.body.msg}`);
    return;
  }
  const { agent_id, api_key } = reg.body.data;
  console.log(`  agent_id: ${agent_id}`);
  console.log(`  api_key:  ${api_key}`);

  // 2. 获取 OpenID（只调一次——服务方身份需要稳定）
  const auth = { Authorization: `Bearer ${api_key}` };
  const me = await request.get(`${BASE_URL}/agents/me`).set(auth).timeout(10000).ok(() => true);
  if (me.body.code !== 0) {
    console.log(`❌ 获取 OpenID 失败: ${me.body.msg}`);
    return;
  }
  const my_openid = me.body.data.my_openid;
  console.log(`  openid:   ${my_openid}`);

  // 3. 输出配置片段
  console.log('\n  ── 复制到 src/apps/05-ReputationSvc/config.json ──');
  console.log(JSON.stringify({
    l0: {
      base_url: BASE_URL,
      agent_id,
      api_key,
      openid: my_openid
    }
  }, null, 2));
}

main().catch(e => console.error('💥', e.message));
