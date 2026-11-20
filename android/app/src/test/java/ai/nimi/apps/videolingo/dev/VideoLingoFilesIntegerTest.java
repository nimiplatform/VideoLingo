package ai.nimi.apps.videolingo.dev;
import org.junit.Test;
import static org.junit.Assert.*;

public class VideoLingoFilesIntegerTest {
    @Test public void acceptsJsonIntegerAndLongWithoutTruncatingFourGiB() {
        assertEquals(0L, VideoLingoFilesPlugin.exactInteger(Integer.valueOf(0)));
        assertEquals(65536L, VideoLingoFilesPlugin.exactInteger(Integer.valueOf(65536)));
        assertEquals(4294967296L, VideoLingoFilesPlugin.exactInteger(Long.valueOf(4294967296L)));
        assertEquals(9007199254740991L, VideoLingoFilesPlugin.exactInteger(Long.valueOf(9007199254740991L)));
    }
    @Test public void rejectsCoercionFractionsNegativeAndUnsafeNumbers() {
        for (Object value : new Object[] { null, "65536", Double.valueOf(1.5), Double.valueOf(1.0), Integer.valueOf(-1), Long.valueOf(9007199254740992L) }) {
            try { VideoLingoFilesPlugin.exactInteger(value); fail("Accepted invalid offset: " + value); }
            catch (IllegalArgumentException expected) { }
        }
    }
}
