package com.elite.clinic.sync

import java.security.MessageDigest
import java.util.Locale
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CanonicalJsonTest {
    @Test
    fun sharedVectorsMatchCanonicalJsonAndSha256() {
        val stream = javaClass.classLoader?.getResourceAsStream(
            "canonical-json-vectors.json",
        )
        assertTrue(
            "canonical-json-vectors.json is missing",
            stream != null,
        )
        val fixture = JSONObject(stream!!.bufferedReader().use { it.readText() })
        assertEquals(1, fixture.getInt("canonicalJsonVersion"))

        val vectors = fixture.getJSONArray("vectors")
        for (index in 0 until vectors.length()) {
            val vector = vectors.getJSONObject(index)
            val canonical = CanonicalJson.encode(vector.getJSONObject("input"))
            assertEquals(vector.getString("canonical"), canonical)
            assertEquals(vector.getString("sha256"), sha256(canonical))
        }
    }

    @Test
    fun distinguishesExplicitNullFromMissingArrayValue() {
        assertEquals(
            "[null,\"value\"]",
            CanonicalJson.encode(JSONObject("{\"items\":[null,\"value\"]}").getJSONArray("items")),
        )
    }

    @Test
    fun preservesSafeIntegerBoundaries() {
        assertEquals(
            "{\"max\":9007199254740991,\"min\":-9007199254740991}",
            CanonicalJson.encode(
                JSONObject("{\"min\":-9007199254740991,\"max\":9007199254740991}"),
            ),
        )
    }

    @Test
    fun hashesUnsignedDescriptorDeterministically() {
        val descriptor = JSONObject(
            "{\"b\":2,\"a\":1,\"responseHash\":\"${"a".repeat(64)}\",\"signatureBase64\":\"${"A".repeat(32)}\"}",
        )
        assertEquals(
            "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
            SessionProtocolCrypto.hashWithoutField(descriptor, "responseHash"),
        )
    }

    @Test
    fun rejectsFractionalAndPrecisionUnsafeNumbers() {
        assertThrowsCanonicalNumber {
            CanonicalJson.encode(JSONObject("{\"value\":1.5}"))
        }
        assertThrowsCanonicalNumber {
            CanonicalJson.encode(JSONObject("{\"value\":9007199254740992}"))
        }
        assertThrowsCanonicalNumber {
            CanonicalJson.encode(JSONObject("{\"value\":9007199254740993}"))
        }
    }

    private fun assertThrowsCanonicalNumber(block: () -> Unit) {
        try {
            block()
            throw AssertionError("Expected ELITE_CANONICAL_JSON_NUMBER")
        } catch (error: IllegalArgumentException) {
            assertTrue(error.message?.contains("ELITE_CANONICAL_JSON_NUMBER") == true)
        }
    }

    private fun sha256(value: String): String = MessageDigest
        .getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(Locale.ROOT, byte) }
}
