require('dotenv').config();
const axios = require('axios');
const puppeteer = require('puppeteer');

const urls = {
  dashboard: `https://www.skinny.co.nz/dashboard/details/BroadbandAccount/${process.env.SKINNY_ACCOUNT}`,
  sign_in: 'https://www.skinny.co.nz/Security/login/',
  addons: 'https://www.skinny.co.nz/dashboard/plans/addons/'
};

const sign_in = async page => {
  await page.goto(urls.sign_in);
  await page.evaluate(
    ([username, password]) => {
      document.querySelector('#MemberLoginForm_LoginForm_Email').value = username;
      document.querySelector('#MemberLoginForm_LoginForm_Password').value = password;
      document.querySelector('#MemberLoginForm_LoginForm').submit();
    },
    [process.env.SKINNY_USER, process.env.SKINNY_PASS]
  );
  await page.waitForNavigation();
};

const scrape_balance = async page => {
  await page.goto(urls.dashboard);
  return await page.evaluate(() => {
    const $section = document.querySelector('.balance.breakdown_data[data-title="Data"]');
    const $left = $section.querySelector('.gauge_holder .gauge .gauge_amount.gauge_amount__left');
    const $right = $section.querySelector('.gauge_holder .gauge .gauge_amount.gauge_amount__right');

    const balance = $left.textContent
      .trim()
      .toLowerCase()
      .split(' ')[0];
    const quota = $right.textContent.trim().toLowerCase();

    if (quota === 'unlimited') {
      return {
        balance,
        quota,
        ratio: 1
      };
    }
    return {
      balance: Number(balance),
      quota: Number(quota),
      ratio: Number(balance) / Number(quota)
    };
  });
};

const purchase_addon = async page => {
    await page.goto(urls.addons);
    await page.evaluate(() => {
        const $bundle = document.querySelector('#_DashboardAddonBlock[data-title="Unlimited Data Boost Add-on"]');
        const $select = $bundle.querySelector('.addon_block a.js-button[href*="selectBundle/7010?"]');
        $select.click();
    });
    await page.waitForSelector('#_DashboardAddonBlock[data-title="Unlimited Data Boost Add-on"] #confirm.addon_confirmation');
    await page.evaluate(() => {
        const $bundle = document.querySelector('#_DashboardAddonBlock[data-title="Unlimited Data Boost Add-on"]');
        const $confirm_area = $bundle.querySelector('#confirm.addon_confirmation .addon_footer');
        const $confirm = $confirm_area.querySelector('a[href*="confirm"]');
        $confirm.click();
    });
};

const notify_purchase = async ({balance, quota, ratio}, purchase) => {
  const token = process.env.SKINNY_BOT;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const params = {
    chat_id: process.env.SKINNY_CHAT_ID,
    parse_mode: 'markdown',
    disable_web_page_preview: true,
    text: `*Skinny 4G Balance*
= Remaining: ${(ratio * 100).toFixed(2)}%
= Data: ${balance}GB of ${quota}GB
= Threshold: ${(process.env.SKINNY_MINIMUM*100).toFixed(0)}%
${purchase ? '= *Purchased: $5 Unlimited Data Boost*\n' : ''}= https://reg.t0.vc/1j.nz-skinny`.trim()
  };
  try {
    await axios.post(url, params);
    console.log(`notification sent.`);
  } catch (e) {
    console.error(e);
  }
};

(async () => {
  const browser = await puppeteer.launch({
    headless: true
  });
  const page = await browser.newPage();

  await sign_in(page);
  const { balance, quota, ratio } = await scrape_balance(page);

  console.log('balance:', {balance, quota, ratio});
  console.log('threshold: ', process.env.SKINNY_MINIMUM);

  if (ratio < process.env.SKINNY_MINIMUM) {
    console.log('purchasing addon.');
      await purchase_addon(page);
      await notify_purchase({balance, quota, ratio}, true);
  } else {
    await notify_purchase({balance, quota, ratio}, false);
  }

  console.log('closing chrome.');
  await page.close();
  await browser.close();
})();
