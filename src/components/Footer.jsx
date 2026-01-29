export default function Footer() {
  return (
    <footer
      style={{
        marginTop: 28,
        padding: "18px 16px",
        borderTop: "1px solid #2b2b2b",
        background: "#121212",
        color: "#cfcfcf",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ marginBottom: 10 }}>
          <b style={{ color: "#eaeaea" }}>版權聲明</b>
          <div>
            FINAL FANTASY XIV © SQUARE ENIX CO., LTD. All Rights Reserved.
            本網站為玩家自製之非官方工具，遊戲素材之著作權與商標權屬原權利人所有。
          </div>
        </div>

        <div>
          <b style={{ color: "#eaeaea" }}>資料來源 / 使用服務</b>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            <span>• XIVAPI</span>
            <span>• Universalis</span>
            <span>• ffxiv-teamcraft（參考資料）</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
