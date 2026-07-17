from typing import Any, Dict, List


def build_template_components(
    template_config: Dict[str, Any], context_variables: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Build Meta template components from campaign config and row context variables.

    template_config structure (stored in campaign.orchestrator_metadata):
    {
        "name": "ticket_evnt",
        "language": "en",
        "header": {"type": "image", "url_column": "image_url"},
        "body_parameters": ["student_name", "event_name"]
    }
    """
    components = []

    header = template_config.get("header")
    if header:
        header_type = header["type"]
        if header_type == "image":
            url_column = header.get("url_column", "image_url")
            image_url = context_variables.get(url_column, "")
            components.append({
                "type": "header",
                "parameters": [{"type": "image", "image": {"link": image_url}}],
            })
        elif header_type == "text":
            text_column = header.get("text_column", "header_text")
            header_text = context_variables.get(text_column, "")
            components.append({
                "type": "header",
                "parameters": [{"type": "text", "text": header_text}],
            })

    body_params = template_config.get("body_parameters", [])
    if body_params:
        parameters = []
        for param_name in body_params:
            value = str(context_variables.get(param_name, ""))
            parameters.append({"type": "text", "text": value})
        components.append({"type": "body", "parameters": parameters})

    return components
