using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace RemoteControl
{
    class Program
    {
        [DllImport("user32.dll")]
        static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

        private const int MOUSEEVENTF_LEFTDOWN = 0x02;
        private const int MOUSEEVENTF_LEFTUP = 0x04;
        private const int MOUSEEVENTF_RIGHTDOWN = 0x08;
        private const int MOUSEEVENTF_RIGHTUP = 0x10;

        static void Main(string[] args)
        {
            if (args.Length < 1) return;

            string command = args[0].ToLower();

            try
            {
                switch (command)
                {
                    case "move":
                        if (args.Length >= 3)
                        {
                            int x = int.Parse(args[1]);
                            int y = int.Parse(args[2]);
                            Cursor.Position = new System.Drawing.Point(x, y);
                        }
                        break;
                    case "click":
                        mouse_event(MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        break;
                    case "type":
                        if (args.Length >= 2)
                        {
                            SendKeys.SendWait(args[1]);
                        }
                        break;
                }
            }
            catch (Exception) { /* Silent fail */ }
        }
    }
}
