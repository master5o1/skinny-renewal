require('dotenv').config();
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

(async () => {
  const browser = await puppeteer.launch({
    headless: false
  });
  const page = await browser.newPage();

  await sign_in(page);
  const { balance, quota, ratio } = await scrape_balance(page);

  console.log('balance:', {balance, quota, ratio});

  if (ratio < process.env.SKINNY_MINIMUM) {
    console.log('purchasing addon.');
      await purchase_addon(page);
  }

  setTimeout(async () => {
    console.log('closing chrome.');
    await page.close();
    await browser.close();
  }, 1000);
})();
