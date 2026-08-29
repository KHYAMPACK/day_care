# Yayınevi örnek dosyaları

Bu klasöre aşağıdaki dosyalar eklendiğinde CSV parser ve cevap anahtarı import otomatik genişletilebilir:

| Dosya | Açıklama |
|-------|----------|
| `answer-key.json` | 90 soru, doğru şık, konu etiketi |
| `results-generic.csv` | student_name / okul_no + ders netleri veya D/Y/B |
| `results-atlas.csv` | Atlas export formatı (örnek) |
| `results-limit.csv` | Limit export formatı (örnek) |

Generic CSV kolon örneği:

```csv
student_name,turkce_net,matematik_net,fen_net,inkilap_net,din_net,ingilizce_net
Ali Veli,15.5,14.0,12.0,8.5,9.0,10.0
```

Detaylı format:

```csv
student_name,turkce_d,turkce_y,turkce_b,matematik_d,matematik_y,matematik_b
```

JSON cevap anahtarı örneği:

```json
[
  {"question_index": 1, "subject_code": "turkce", "correct_choice": "B", "topic_label": "Paragrafta Anlam"}
]
```
