// ==UserScript==
// @name         YAMAPプロフィール補足情報表示
// @namespace    https://github.com/bunatree
// @version      1.0.0
// @description  YAMAPのユーザープロフィールに補足情報を表示します
// @author       Bunatree
// @match        https://yamap.com/users/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // 補足情報の取得方法
  // localJson ... 当スクリプト内のuserData変数で記述（JSON形式）
  // googleSpreadsheet ... 別途Googleスプレッドシートとして作成する
  const obtainDataMethod = 'localJson'; // 'googleSpreadsheet' に変更可能

  // 補足情報の挿入位置 (before/after)
  const insertPosition = 'before';

  // obtainDataMethodで「googleSpreadsheet」を指定した場合、
  // ここでスプレッドシートの公開URLまたはドキュメントIDを指定する
  const googleSpreadsheetUrl = 'https://docs.google.com/spreadsheets/d/MySpreadsheetId/edit?usp=sharing';
  const googleSpreadsheetId = ''; // こちらにドキュメントIDを書く場合はgoogleSpreadsheetUrlを空にする

  const googleCsvUrl = (() => {
    const docId = googleSpreadsheetId ||
                  (googleSpreadsheetUrl.match(/spreadsheets\/d\/([^/]+)/) || [])[1];
    return docId
      ? `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`
      : null;
  })();

  // obtainDataMethodで「localJson」を指定した場合、ここで補足情報をユーザーごとに定義する
  // 下記は、IDが「123」と「456」のユーザーの補足情報を定義する例
  const localUserData = {
    "123": [
      { label: "名前", value: "山田太郎" },
      { label: "メモ", value: "身長が256cmあるナイスガイ。2023年8月に塔ノ岳でお会いして一緒に大倉尾根を下山。" },
      { label: "ヤマレコ", value: "YAMA DA TARO", url: "https://www.yamareco.com/modules/yamareco/userinfo-0000-prof.html" },
      { label: "Facebook", value: "山田太郎 FB", url: "https://www.facebook.com/user/info/304904" },
      { label: "Instagram", value: "@hogehoge", url: "https://instagram.com/hogehoge" },
      { label: "ブログ", url: "https://mydomain.com/blog/welcome.html" }
    ],
    "456": [
      { label: "名前", value: "山田花子" },
      { label: "メモ", value: "2022年6月に青ヶ岳山荘に泊まったときに一緒にブルーマウンテンを味わった☕" },
      { label: "YouTube チャンネル", value: "花子の山てくてく", url: "https://youtube.com/channel/abcd0000" }
    ]
  };

  const match = location.href.match(/yamap\.com\/users\/(\d+)/);
  if (!match) return;
  const userId = match[1];

  // 補足情報を表示するテーブルを作成
  function renderTable(info) {

    if (!info || info.length === 0) return;

    const table = document.createElement('table');
    table.classList.add('yamap-additional-info');

    info.forEach(item => {
      const tr = document.createElement('tr');

      const th = document.createElement('th');
      th.textContent = item.label;

      const td = document.createElement('td');

      if (item.url) {
        const a = document.createElement('a');
        a.href = item.url;
        a.textContent = item.value || item.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        td.appendChild(a);
      } else {
        td.textContent = item.value;
      }

      tr.appendChild(th);
      tr.appendChild(td);
      table.appendChild(tr);
    });

    return table;

  }

  function setStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .yamap-additional-info {
        width: 100%;
        margin: 1rem 0;
        border-collapse: collapse;
      }

      .yamap-additional-info th,
      .yamap-additional-info td {
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
        text-align: left;
        vertical-align: top;
        font-size: calc(14 / var(--yamap-root-font-size, 10) * 1rem);
      }

      .yamap-additional-info th {
        white-space: nowrap;
        width: 10%;
        padding-right: 1em;
      }
    `;
    document.head.appendChild(style);
  }

  // Googleスプレッドシートのヘッダーから改行や空白削除
  // ヘッダー文字を小文字化
  function cleanUpHeader(header) {
    return header.trim().toLowerCase();
  }

  function getSpreadsheetData(callback) {

    if (!googleCsvUrl) {
      console.error('GoogleスプレッドシートのURLまたはIDが正しく設定されていません');
      return;
    }

    fetch(googleCsvUrl)
      .then(res => res.text())
      .then(csvText => {
        const rows = csvText
          .trim()
          .split('\n')
          .map(row => row.split(',').map(cell => cell.trim()));
        const headers = rows[0].map(cleanUpHeader);
        const idxUserId = headers.indexOf('userid');
        const idxLabel = headers.indexOf('label');
        const idxValue = headers.indexOf('value');
        const idxUrl = headers.indexOf('url');

        if (idxUserId === -1 || idxLabel === -1 || idxValue === -1) {
          console.error('CSVヘッダーに必要な項目がありません');
          return;
        }

        const userData = {};
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const uid = row[idxUserId];
          if (!uid) continue;
          if (!userData[uid]) userData[uid] = [];
          userData[uid].push({
            label: row[idxLabel],
            value: row[idxValue],
            url: idxUrl !== -1 ? row[idxUrl] : undefined
          });
        }
        callback(userData);
      })
      .catch(err => {
        console.error('スプレッドシートの読み込みに失敗しました', err);
      });
  }

  // Ajax読み込みに対応するために時間を置いてテーブル挿入を実行
  function waitForElement(selectorFn, callback, timeout = 10000, interval = 300) {
    const start = Date.now();
    const timer = setInterval(() => {
      const el = selectorFn();
      if (el) {
        clearInterval(timer);
        callback(el);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        console.warn('selectorFnによる要素が見つかりませんでした。');
      }
    }, interval);
  }

  // メイン処理実行
  waitForElement(() => {
    return [...document.querySelectorAll('p')].find(p => p.textContent.includes('ユーザーID:'));
  }, (uidP) => {
    const basicInfoBlock = uidP.closest('div')?.nextElementSibling;
    if (!basicInfoBlock) return;

    // もし補足情報が挿入済みだったら補足情報のテーブル行をすべて削除する
    // スクリプトの二重実行対策
    document.querySelectorAll('.yamap-additional-info').forEach(el => el.remove());

    if (obtainDataMethod === 'localJson') {
      const table = renderTable(localUserData[userId]);
      if (!table) return;
      if (insertPosition === 'before') {
        basicInfoBlock.parentNode.insertBefore(table, basicInfoBlock);
      } else {
        basicInfoBlock.parentNode.insertBefore(table, basicInfoBlock.nextSibling);
      }
    } else if (obtainDataMethod === 'googleSpreadsheet') {
      getSpreadsheetData(data => {
        const table = renderTable(data[userId]);
        if (!table) return;
        if (insertPosition === 'before') {
          basicInfoBlock.parentNode.insertBefore(table, basicInfoBlock);
        } else {
          basicInfoBlock.parentNode.insertBefore(table, basicInfoBlock.nextSibling);
        }
      });
    }

    // 補足情報テーブルにCSSを適用
    setStyles();

  });

})();
