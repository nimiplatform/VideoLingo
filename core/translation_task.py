"""Original multi-step translation with Host-owned, per-project checkpoints."""
from pathlib import Path
from ruamel.yaml import YAML
from core.preview_tasks import configuration
from core.nimi_bridge import request_model


def translate_subtitles(request, workspace):
    configuration(request)
    yaml = YAML()
    with open('config.yaml', encoding='utf-8') as file:
        config = yaml.load(file)
    # Original product defaults for deterministic orchestration, never AI routing.
    config.update(request['businessSettings'])
    with open('config.yaml', 'w', encoding='utf-8') as file:
        yaml.dump(config, file)
    from core._3_2_split_meaning import split_sentences_by_meaning
    from core._4_1_summarize import get_summary
    from core._4_2_translate import translate_all
    from core._5_split_sub import split_for_sub_main
    from core._6_gen_sub import align_timestamp_main

    steps = [('meaning', split_sentences_by_meaning), ('terminology', get_summary),
             ('translation', translate_all), ('subtitle-splitting', split_for_sub_main),
             ('timestamps', align_timestamp_main)]
    completed = request.get('completedSteps', [])
    for name, run in steps:
        if name in completed:
            continue
        run()
        request_model('checkpoint', {'stage': name})
    return {'files': [str(file) for file in (workspace / 'output').glob('*.srt')]}
