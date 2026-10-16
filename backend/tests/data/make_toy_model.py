import json, os, shutil, zipfile, random
import sentencepiece as spm
random.seed(0)
words = "il la di che e un una per con non sono questo documento contratto prova riga pagina testo the of and to is this page line test document contract".split()
with open("corpus.txt","w") as f:
    for _ in range(3000):
        f.write(" ".join(random.choice(words) for _ in range(random.randint(3,12))).capitalize()+".\n")
spm.SentencePieceTrainer.train(input="corpus.txt", model_prefix="sp", vocab_size=100, model_type="unigram", character_coverage=1.0,
                               pad_id=3, unk_id=0, bos_id=-1, eos_id=1, pad_piece="<pad>", eos_piece="</s>", unk_piece="<unk>")
sp = spm.SentencePieceProcessor(model_file="sp.model")
vocab = {sp.id_to_piece(i): i for i in range(sp.get_piece_size())}
os.makedirs("hf", exist_ok=True)
json.dump(vocab, open("hf/vocab.json","w"))
shutil.copy("sp.model","hf/source.spm"); shutil.copy("sp.model","hf/target.spm")
from transformers import MarianConfig, MarianMTModel, MarianTokenizer
V = len(vocab)
cfg = MarianConfig(vocab_size=V + 1, d_model=32, encoder_layers=1, decoder_layers=1, encoder_attention_heads=2, decoder_attention_heads=2,
                   encoder_ffn_dim=64, decoder_ffn_dim=64, max_position_embeddings=128, pad_token_id=vocab["<pad>"], eos_token_id=vocab["</s>"],
                   decoder_start_token_id=vocab["<pad>"], share_encoder_decoder_embeddings=True)
m = MarianMTModel(cfg); m.save_pretrained("hf")
tok = MarianTokenizer(source_spm="hf/source.spm", target_spm="hf/target.spm", vocab="hf/vocab.json"); tok.save_pretrained("hf")
import ctranslate2
for a, b in (("it","en"), ("en","fr")):
    name = f"translate-{a}_{b}-1_0"
    if os.path.exists(name): shutil.rmtree(name)
    os.makedirs(name)
    ctranslate2.converters.TransformersConverter("hf").convert(f"{name}/model", quantization="int8", force=True)
    shutil.copy("sp.model", f"{name}/sentencepiece.model")
    json.dump({"package_version":"1.0","argos_version":"1.0","from_code":a,"from_name":a,"to_code":b,"to_name":b}, open(f"{name}/metadata.json","w"))
    with zipfile.ZipFile(f"{name}.argosmodel","w") as z:
        for root,_,files in os.walk(name):
            for fn in files: z.write(os.path.join(root,fn))
print("ok", os.listdir("."), os.listdir("translate-it_en-1_0/model"))
