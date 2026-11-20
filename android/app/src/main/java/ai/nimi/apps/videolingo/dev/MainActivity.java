package ai.nimi.apps.videolingo.dev;

import com.getcapacitor.BridgeActivity;
import android.widget.TextView;
import androidx.webkit.WebViewFeature;

public class MainActivity extends BridgeActivity {
    @Override protected void load() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            TextView message = new TextView(this); message.setText("Update Android System WebView to use VideoLingo. A main-frame-only native bridge is required."); message.setPadding(32,64,32,32); setContentView(message); return;
        }
        registerPlugin(VideoLingoFilesPlugin.class); super.load();
        bridge.getWebView().removeJavascriptInterface("androidBridge");
    }
}
