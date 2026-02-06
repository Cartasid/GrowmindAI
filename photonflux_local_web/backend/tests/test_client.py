# tests/test_app.py
import importlib
import os
import sys
import unittest
from unittest import mock


class RetrySettingsTests(unittest.TestCase):
    def setUp(self) -> None:
        module = importlib.import_module("backend.app")
        self.app = importlib.reload(module)
        self._reset_module_state(self.app)
        self.addCleanup(self._cleanup_module_state)

    def _reset_module_state(self, module) -> None:
        module.CLIENT = None
        if hasattr(module, "_CLIENT_TIMEOUT_MS"):
            module._CLIENT_TIMEOUT_MS = None
        if hasattr(module, "_MODEL_NAME"):
            module._MODEL_NAME = None

    def _cleanup_module_state(self) -> None:
        module = sys.modules.get("backend.app")
        if module is not None:
            self._reset_module_state(module)

    def test_retry_settings_defaults(self) -> None:
        settings = self.app._retry_settings()
        self.assertEqual(settings["tries"], 4)
        self.assertEqual(settings["timeout"], 120.0)
        self.assertEqual(settings["initial_delay"], 1.0)
        self.assertEqual(settings["max_delay"], 16.0)
        self.assertEqual(settings["jitter_ratio"], 0.3)

    def test_retry_settings_env_override(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "GEMINI_MAX_RETRIES": "6",
                "GEMINI_REQUEST_TIMEOUT": "240",
                "GEMINI_BACKOFF_INITIAL": "2.5",
                "GEMINI_BACKOFF_MAX": "60",
                "GEMINI_BACKOFF_JITTER_RATIO": "0.6",
            },
        ):
            settings = self.app._retry_settings()

        self.assertEqual(settings["tries"], 6)
        self.assertEqual(settings["timeout"], 240.0)
        self.assertEqual(settings["initial_delay"], 2.5)
        self.assertEqual(settings["max_delay"], 60.0)
        self.assertEqual(settings["jitter_ratio"], 0.6)


class ClientSingletonTests(unittest.TestCase):
    def setUp(self) -> None:
        module = importlib.import_module("backend.app")
        self.app = importlib.reload(module)
        self._reset_module_state(self.app)
        self.addCleanup(self._cleanup_module_state)

    def _reset_module_state(self, module) -> None:
        module.CLIENT = None
        if hasattr(module, "_CLIENT_TIMEOUT_MS"):
            module._CLIENT_TIMEOUT_MS = None
        if hasattr(module, "_MODEL_NAME"):
            module._MODEL_NAME = None

    def _cleanup_module_state(self) -> None:
        module = sys.modules.get("backend.app")
        if module is not None:
            self._reset_module_state(module)

    def test_client_is_cached_across_calls(self) -> None:
        with mock.patch.object(self.app, "_api_key", return_value="cached-key") as mock_api_key, \
                mock.patch.object(self.app.genai, "Client", autospec=True) as mock_client:
            client_instance = mock.Mock(name="client_instance")
            mock_client.return_value = client_instance

            first = self.app._client()
            second = self.app._client()

        self.assertIs(first, client_instance)
        self.assertIs(second, client_instance)
        self.assertEqual(mock_client.call_count, 1)
        mock_api_key.assert_called_once()

    def test_client_is_recreated_after_restart(self) -> None:
        first_client = object()
        with mock.patch.object(self.app, "_api_key", return_value="first"), \
                mock.patch.object(self.app.genai, "Client", return_value=first_client) as mock_first_client:
            created_first = self.app._client()

        self.assertIs(created_first, first_client)
        self.assertEqual(mock_first_client.call_count, 1)

        sys.modules.pop("backend.app", None)
        reloaded = importlib.import_module("backend.app")

        second_client = object()
        with mock.patch.object(reloaded, "_api_key", return_value="second"), \
                mock.patch.object(reloaded.genai, "Client", return_value=second_client) as mock_second_client:
            created_second = reloaded._client()

        self.assertIs(created_second, second_client)
        self.assertEqual(mock_second_client.call_count, 1)
        self.assertIs(reloaded.CLIENT, second_client)

    def test_client_recreated_when_timeout_changes(self) -> None:
        first_client = object()
        second_client = object()

        with mock.patch.object(self.app, "_api_key", return_value="key"), \
                mock.patch.object(self.app.genai, "Client", side_effect=[first_client, second_client]) as mock_client:
            created_first = self.app._client(timeout=90.5)   # 90500 ms
            created_second = self.app._client(timeout=180.0) # 180000 ms

        self.assertIs(created_first, first_client)
        self.assertIs(created_second, second_client)
        self.assertEqual(mock_client.call_count, 2)
        first_call_kwargs = mock_client.call_args_list[0].kwargs
        second_call_kwargs = mock_client.call_args_list[1].kwargs
        self.assertEqual(first_call_kwargs["http_options"].timeout, 90500)
        self.assertEqual(second_call_kwargs["http_options"].timeout, 180000)


class GenerateJsonRetryTests(unittest.TestCase):
    def setUp(self) -> None:
        module = importlib.import_module("backend.app")
        self.app = importlib.reload(module)
        self._reset_module_state(self.app)
        self.addCleanup(self._cleanup_module_state)

    def _reset_module_state(self, module) -> None:
        module.CLIENT = None
        if hasattr(module, "_CLIENT_TIMEOUT_MS"):
            module._CLIENT_TIMEOUT_MS = None
        if hasattr(module, "_MODEL_NAME"):
            module._MODEL_NAME = None

    def _cleanup_module_state(self) -> None:
        module = sys.modules.get("backend.app")
        if module is not None:
            self._reset_module_state(module)

    def test_retry_on_retryable_api_error(self) -> None:
        mock_client = mock.Mock()
        mock_client.models = mock.Mock()

        success_response = mock.Mock()
        success_response.text = '{"ok": true}'

        call_state = {"count": 0}

        def _generate(*args, **kwargs):
            call_state["count"] += 1
            if call_state["count"] == 1:
                raise self.app.errors.APIError(
                    503,
                    {"error": {"message": "Deadline expired before operation could complete."}},
                )
            return success_response

        mock_client.models.generate_content.side_effect = _generate

        retry_settings = {
            "tries": 4,
            "timeout": 120.0,
            "initial_delay": 1.0,
            "max_delay": 16.0,
            "jitter_ratio": 0.3,
        }

        with mock.patch.object(self.app, "_retry_settings", return_value=retry_settings), \
                mock.patch.object(self.app, "_client", return_value=mock_client) as mock_client_factory, \
                mock.patch.object(self.app, "_reset_client") as mock_reset, \
                mock.patch.object(self.app.time, "sleep") as mock_sleep, \
                mock.patch.object(self.app.random, "uniform", return_value=0.0):
            parts = [self.app.types.Part.from_text(text="Hello")]
            parsed, raw = self.app._generate_json_with_retry(
                user_parts=parts,
                extra_instruction="{}",
                max_tokens=10,
                temperature=0.1,
                tries=2,
            )

        self.assertEqual(call_state["count"], 2)
        mock_sleep.assert_called_once()
        mock_reset.assert_called_once()
        self.assertEqual(
            mock_client_factory.call_args_list,
            [mock.call(retry_settings["timeout"]), mock.call(retry_settings["timeout"])]
        )
        self.assertEqual(parsed, {"ok": True})
        self.assertEqual(raw, '{"ok": true}')

    def test_no_retry_on_non_retryable_api_error(self) -> None:
        mock_client = mock.Mock()
        mock_client.models = mock.Mock()

        mock_client.models.generate_content.side_effect = self.app.errors.APIError(
            400,
            {"error": {"message": "Invalid request."}},
        )

        retry_settings = {
            "tries": 4,
            "timeout": 120.0,
            "initial_delay": 1.0,
            "max_delay": 16.0,
            "jitter_ratio": 0.3,
        }

        with mock.patch.object(self.app, "_retry_settings", return_value=retry_settings), \
                mock.patch.object(self.app, "_client", return_value=mock_client) as mock_client_factory, \
                mock.patch.object(self.app, "_reset_client") as mock_reset, \
                mock.patch.object(self.app.time, "sleep") as mock_sleep, \
                mock.patch.object(self.app.random, "uniform", return_value=0.0):
            parts = [self.app.types.Part.from_text(text="Hi")]
            with self.assertRaises(self.app.errors.APIError):
                self.app._generate_json_with_retry(
                    user_parts=parts,
                    extra_instruction="{}",
                    max_tokens=10,
                    temperature=0.1,
                    tries=2,
                )

        mock_sleep.assert_not_called()
        mock_reset.assert_not_called()
        mock_client_factory.assert_called_once_with(retry_settings["timeout"])

    def test_request_timeout_is_applied(self) -> None:
        mock_client = mock.Mock()
        mock_client.models = mock.Mock()

        success_response = mock.Mock()
        success_response.text = '{"ok": true}'

        mock_client.models.generate_content.return_value = success_response

        retry_settings = {
            "tries": 4,
            "timeout": 120.0,
            "initial_delay": 1.0,
            "max_delay": 16.0,
            "jitter_ratio": 0.3,
        }

        with mock.patch.object(self.app, "_client", return_value=mock_client) as mock_client_factory, \
                mock.patch.object(self.app, "_retry_settings", return_value=retry_settings):
            parts = [self.app.types.Part.from_text(text="Hello")]
            parsed, raw = self.app._generate_json_with_retry(
                user_parts=parts,
                extra_instruction="{}",
                max_tokens=10,
                temperature=0.1,
                tries=1,
                request_timeout=321.0,
            )

        self.assertEqual(parsed, {"ok": True})
        self.assertEqual(raw, '{"ok": true}')


class BuildImagePromptTests(unittest.TestCase):
    def setUp(self) -> None:
        module = importlib.import_module("backend.app")
        self.app = importlib.reload(module)

    def test_observations_only_include_active_flags(self) -> None:
        payload = self.app.AnalyzeImagePayload(
            imagesBase64=["dummy"],
            inputs={
                "tipburn": "yes",
                "pale": "no",
                "caMgDeficiency": "",
                "claw": False,
            },
            fullPhaseName="Flowering W4",
        )

        prompt = self.app._build_image_prompt(payload)

        self.assertIn("Observations: tipburn", prompt)
        self.assertNotIn("pale", prompt)
        self.assertNotIn("caMgDeficiency", prompt)
        self.assertNotIn("claw", prompt)

    def test_truthy_strings_are_not_misinterpreted(self) -> None:
        payload = self.app.AnalyzeImagePayload(
            imagesBase64=["dummy"],
            inputs={
                "tipburn": "YES",
                "pale": "  yes  ",
                "caMgDeficiency": "0",
                "claw": "off",
            },
        )

        prompt = self.app._build_image_prompt(payload)

        self.assertIn("Observations: tipburn, pale", prompt)
        self.assertNotIn("caMgDeficiency", prompt)
        self.assertNotIn("claw", prompt)


if __name__ == "__main__":
    unittest.main()
