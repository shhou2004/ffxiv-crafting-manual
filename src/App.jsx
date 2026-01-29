import { Routes, Route } from "react-router-dom";
import TopBar from "./components/TopBar.jsx";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import Item from "./pages/Item.jsx";

export default function App() {
  return (
    <div>
      <TopBar />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/item/:itemId" element={<Item />} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}
