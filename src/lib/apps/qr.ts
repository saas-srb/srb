import "server-only";
import QRCode from "qrcode";

/** An SVG QR code (dark on transparent) for `text`, to open the app address from a phone's camera. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, width: 168, color: { dark: "#111111", light: "#00000000" } });
}
